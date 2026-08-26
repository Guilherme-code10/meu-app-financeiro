require("dotenv").config();

const express = require("express");
const path = require("path");

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_PUBLISHABLE_KEY
);

const app = express();
const PORT = process.env.PORT || 3000;

const PIERRE_API_URL =
  "https://www.pierre.finance/tools/api";

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ==========================================
// CONEXÃO COM A API DO PIERRE
// ==========================================

async function pierreRequest(endpoint, params = {}) {
  if (!process.env.PIERRE_API_KEY) {
    throw new Error(
      "PIERRE_API_KEY não encontrada no arquivo .env"
    );
  }

  const url = new URL(
    `${PIERRE_API_URL}/${endpoint}`
  );

  Object.entries(params).forEach(
    ([chave, valor]) => {
      if (
        valor !== undefined &&
        valor !== null &&
        valor !== ""
      ) {
        url.searchParams.set(
          chave,
          valor
        );
      }
    }
  );

  const resposta = await fetch(url, {
    method: "GET",

    headers: {
      Authorization:
        `Bearer ${process.env.PIERRE_API_KEY}`,
    },
  });

  const dados =
    await resposta.json();

  if (!resposta.ok) {
    throw new Error(
      dados?.message ||
        dados?.error ||
        `Erro ${resposta.status} na API do Pierre`
    );
  }

  return dados;
}

// ==========================================
// NORMALIZAR TEXTO
// ==========================================

function normalizarTexto(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

// ==========================================
// CONTAS
// ==========================================

app.get(
  "/api/accounts",
  async (req, res) => {
    try {
      const dados =
        await pierreRequest(
          "get-accounts"
        );

      const registros =
        Array.isArray(dados.data)
          ? dados.data
          : [];

      const contasBancarias =
        registros.filter(
          (conta) =>
            conta.type === "BANK" &&
            conta.itemIsActive !== false
        );

      const cartoes =
        registros.filter(
          (conta) =>
            conta.type === "CREDIT" &&
            conta.itemIsActive !== false
        );

      const investimentos =
        registros.filter(
          (conta) =>
            conta.type === "INVESTMENT" &&
            conta.itemIsActive !== false
        );

      const contas =
        contasBancarias.map(
          (conta) => ({
            id: conta.id,

            nome:
              conta.customName ||
              conta.name ||
              "Conta bancária",

            banco:
              conta.connectorName ||
              conta.marketingName ||
              "Banco não informado",

            tipo:
              conta.type,

            subtipo:
              conta.subtype ||
              "Não informado",

            saldo:
              Number(
                conta.balance || 0
              ),

            moeda:
              conta.currencyCode ||
              "BRL",

            ativa:
              conta.itemIsActive !== false,
          })
        );

      const cartoesFormatados =
        cartoes.map(
          (cartao) => {
            const credito =
              cartao.creditData ||
              {};

            return {
              id: cartao.id,

              nome:
                cartao.customName ||
                cartao.name ||
                "Cartão",

              banco:
                cartao.connectorName ||
                cartao.marketingName ||
                "Banco não informado",

              tipo:
                cartao.type,

              subtipo:
                cartao.subtype ||
                "CREDIT_CARD",

              saldo:
                Number(
                  cartao.balance || 0
                ),

              moeda:
                cartao.currencyCode ||
                "BRL",

              limite:
                Number(
                  credito.creditLimit ||
                    credito.limit ||
                    0
                ),

              limiteDisponivel:
                Number(
                  credito.availableCreditLimit ||
                    credito.availableLimit ||
                    0
                ),

              vencimento:
                credito.balanceDueDate ||
                null,

              fechamento:
                credito.balanceCloseDate ||
                null,

              ativa:
                cartao.itemIsActive !== false,
            };
          }
        );

      const investimentosFormatados =
        investimentos.map(
          (investimento) => ({
            id:
              investimento.id,

            nome:
              investimento.customName ||
              investimento.name ||
              "Investimento",

            banco:
              investimento.connectorName ||
              investimento.marketingName ||
              "Instituição não informada",

            tipo:
              investimento.type,

            subtipo:
              investimento.subtype ||
              "Não informado",

            saldo:
              Number(
                investimento.balance ||
                  0
              ),

            moeda:
              investimento.currencyCode ||
              "BRL",
          })
        );

      const saldoTotalContas =
        contas.reduce(
          (total, conta) =>
            total + conta.saldo,
          0
        );

      const limiteTotal =
        cartoesFormatados.reduce(
          (total, cartao) =>
            total + cartao.limite,
          0
        );

      const limiteDisponivelTotal =
        cartoesFormatados.reduce(
          (total, cartao) =>
            total +
            cartao.limiteDisponivel,
          0
        );

      const saldoCartoes =
        cartoesFormatados.reduce(
          (total, cartao) =>
            total + cartao.saldo,
          0
        );

      const saldoInvestimentos =
        investimentosFormatados.reduce(
          (total, investimento) =>
            total +
            investimento.saldo,
          0
        );

      res.json({
        sucesso: true,

        quantidadeTotal:
          registros.length,

        contas,

        cartoes:
          cartoesFormatados,

        investimentos:
          investimentosFormatados,

        totais: {
          saldoContas:
            saldoTotalContas,

          saldoCartoes:
            saldoCartoes,

          limiteCartoes:
            limiteTotal,

          limiteDisponivel:
            limiteDisponivelTotal,

          investimentos:
            saldoInvestimentos,
        },
      });

    } catch (erro) {

      console.error(
        "Erro ao buscar contas:",
        erro.message
      );

      res.status(500).json({
        sucesso: false,
        erro: erro.message,
      });
    }
  }
);

// ==========================================
// TRANSAÇÕES
// ==========================================

app.get(
  "/api/transactions",
  async (req, res) => {
    try {
      const hoje =
        new Date();

      const tresMesesAtras =
        new Date(hoje);

      tresMesesAtras.setMonth(
        tresMesesAtras.getMonth() - 3
      );

      const dataInicio =
        req.query.startDate ||
        tresMesesAtras
          .toISOString()
          .slice(0, 10);

      const dataFim =
        req.query.endDate ||
        hoje
          .toISOString()
          .slice(0, 10);

      const dados =
        await pierreRequest(
          "get-transactions",
          {
            startDate:
              dataInicio,

            endDate:
              dataFim,

            format:
              "raw",
          }
        );

      const transacoes =
        Array.isArray(dados.data)
          ? dados.data
          : [];

      const transacoesFormatadas =
        transacoes.map(
          (transacao) => ({
            id:
              transacao.id,

            descricao:
              transacao.description ||
              "Transação",

            categoria:
              transacao.category ||
              "Sem categoria",

            valor:
              Number(
                transacao.amount ||
                  0
              ),

            data:
              transacao.date ||
              "",

            tipo:
              transacao.type ||
              (
                Number(
                  transacao.amount ||
                    0
                ) >= 0
                  ? "CREDITO"
                  : "DEBITO"
              ),

            status:
              transacao.status ||
              "",

            conta:
              transacao.account_name ||
              transacao.accountName ||
              "Conta",

            tipoConta:
              transacao.account_type ||
              transacao.accountType ||
              "",
          })
        );

      res.json({
        sucesso: true,

        quantidade:
          transacoesFormatadas.length,

        dataInicio,

        dataFim,

        transacoes:
          transacoesFormatadas,
      });

    } catch (erro) {

      console.error(
        "Erro ao buscar transações:",
        erro.message
      );

      res.status(500).json({
        sucesso: false,
        erro: erro.message,
      });
    }
  }
);

// ==========================================
// DEBUG - VER DADOS BRUTOS DO PIERRE
// ==========================================

app.get(
  "/api/debug/transacoes",
  async (req, res) => {
    try {
      const hoje =
        new Date();

      const tresMesesAtras =
        new Date(hoje);

      tresMesesAtras.setMonth(
        tresMesesAtras.getMonth() - 3
      );

      const dados =
        await pierreRequest(
          "get-transactions",
          {
            startDate:
              tresMesesAtras
                .toISOString()
                .slice(0, 10),

            endDate:
              hoje
                .toISOString()
                .slice(0, 10),

            format:
              "raw",
          }
        );

      res.json({
        sucesso: true,

        quantidade:
          Array.isArray(
            dados.data
          )
            ? dados.data.length
            : 0,

        transacoes:
          Array.isArray(
            dados.data
          )
            ? dados.data
            : [],
      });

    } catch (erro) {

      console.error(
        "Erro ao buscar transações brutas:",
        erro.message
      );

      res.status(500).json({
        sucesso: false,
        erro: erro.message,
      });
    }
  }
);

// ==========================================
// TESTE DA CONEXÃO COM O PIERRE
// ==========================================

app.get(
  "/api/health",
  async (req, res) => {
    try {

      const dados =
        await pierreRequest(
          "get-accounts"
        );

      res.json({
        conectado: true,

        registros:
          Array.isArray(
            dados.data
          )
            ? dados.data.length
            : 0,
      });

    } catch (erro) {

      res.status(500).json({
        conectado: false,
        erro: erro.message,
      });
    }
  }
);

// ==========================================
// CAIXINHAS - BUSCAR
// ==========================================

app.get(
  "/api/caixinhas",
  async (req, res) => {
    try {

      const {
        data,
        error,
      } = await supabase
        .from("caixinhas")
        .select("*")
        .order(
          "created_at",
          {
            ascending: false,
          }
        );

      if (error) {
        throw error;
      }

      res.json({
        sucesso: true,
        caixinhas: data,
      });

    } catch (erro) {

      console.error(
        "Erro ao buscar caixinhas:",
        erro.message
      );

      res.status(500).json({
        sucesso: false,
        erro: erro.message,
      });
    }
  }
);

// ==========================================
// CAIXINHAS - CRIAR
// ==========================================

app.post(
  "/api/caixinhas",
  async (req, res) => {
    try {

      const {
        nome,
        meta,
        saldo,
        descricao,
      } = req.body;

      if (
        !nome ||
        nome.trim() === ""
      ) {
        return res.status(400).json({
          sucesso: false,
          erro:
            "O nome da caixinha é obrigatório.",
        });
      }

      const metaNumerica =
        Number(meta);

      const saldoNumerico =
        Number(saldo) || 0;

      if (
        !Number.isFinite(
          metaNumerica
        ) ||
        metaNumerica <= 0
      ) {
        return res.status(400).json({
          sucesso: false,
          erro:
            "A meta deve ser maior que zero.",
        });
      }

      if (
        !Number.isFinite(
          saldoNumerico
        ) ||
        saldoNumerico < 0
      ) {
        return res.status(400).json({
          sucesso: false,
          erro:
            "O saldo inicial não pode ser negativo.",
        });
      }

      const {
        data,
        error,
      } = await supabase
        .from("caixinhas")
        .insert([
          {
            nome:
              nome.trim(),

            meta:
              metaNumerica,

            saldo:
              saldoNumerico,

            descricao:
              descricao?.trim() ||
              null,
          },
        ])
        .select()
        .single();

      if (error) {
        throw error;
      }

      res.status(201).json({
        sucesso: true,

        mensagem:
          "Caixinha criada com sucesso.",

        caixinha:
          data,
      });

    } catch (erro) {

      console.error(
        "Erro ao criar caixinha:",
        erro.message
      );

      res.status(500).json({
        sucesso: false,
        erro: erro.message,
      });
    }
  }
);

// ==========================================
// MOVIMENTAÇÕES DAS CAIXINHAS
// ==========================================

app.post(
  "/api/caixinhas/:id/movimentacoes",
  async (req, res) => {
    try {

      const { id } =
        req.params;

      const {
        tipo,
        valor,
        descricao,
      } = req.body;

      if (!tipo || !valor) {
        return res.status(400).json({
          sucesso: false,
          erro:
            "Tipo e valor são obrigatórios.",
        });
      }

      const tiposPermitidos = [
        "ENTRADA",
        "SAIDA",
      ];

      if (
        !tiposPermitidos.includes(
          tipo
        )
      ) {
        return res.status(400).json({
          sucesso: false,
          erro:
            "Tipo de movimentação inválido. Use ENTRADA ou SAIDA.",
        });
      }

      const valorNumerico =
        Number(valor);

      if (
        !Number.isFinite(
          valorNumerico
        ) ||
        valorNumerico <= 0
      ) {
        return res.status(400).json({
          sucesso: false,
          erro:
            "O valor deve ser maior que zero.",
        });
      }

      const {
        data: caixinha,
        error: erroCaixinha,
      } = await supabase
        .from("caixinhas")
        .select(
          "id, saldo"
        )
        .eq(
          "id",
          id
        )
        .single();

      if (
        erroCaixinha
      ) {
        return res.status(404).json({
          sucesso: false,
          erro:
            "Caixinha não encontrada.",
        });
      }

      const saldoAtual =
        Number(
          caixinha.saldo || 0
        );

      let novoSaldo;

      if (
        tipo === "ENTRADA"
      ) {
        novoSaldo =
          saldoAtual +
          valorNumerico;
      } else {
        novoSaldo =
          saldoAtual -
          valorNumerico;
      }

      if (
        novoSaldo < 0
      ) {
        return res.status(400).json({
          sucesso: false,
          erro:
            "A caixinha não possui saldo suficiente para essa saída.",
        });
      }

      const {
        data,
        error,
      } = await supabase
        .from(
          "movimentacoes_caixinhas"
        )
        .insert([
          {
            caixinha_id:
              caixinha.id,

            tipo,

            valor:
              valorNumerico,

            descricao:
              descricao?.trim() ||
              null,
          },
        ])
        .select()
        .single();

      if (error) {
        throw error;
      }

      const {
        data: caixinhaAtualizada,
        error:
          erroAtualizacao,
      } = await supabase
        .from("caixinhas")
        .update({
          saldo:
            novoSaldo,

          updated_at:
            new Date().toISOString(),
        })
        .eq(
          "id",
          id
        )
        .select()
        .single();

      if (
        erroAtualizacao
      ) {
        throw erroAtualizacao;
      }

      res.status(201).json({
        sucesso: true,

        mensagem:
          "Movimentação registrada com sucesso.",

        movimentacao:
          data,

        caixinha:
          caixinhaAtualizada,
      });

    } catch (erro) {

      console.error(
        "Erro ao movimentar caixinha:",
        erro.message
      );

      res.status(500).json({
        sucesso: false,
        erro: erro.message,
      });
    }
  }
);

// ==========================================
// SINCRONIZAR CAIXINHAS COM O PIERRE
// ==========================================

app.post(
  "/api/caixinhas/sincronizar",
  async (req, res) => {
    try {

      console.log(
        "🔄 Iniciando sincronização das caixinhas..."
      );

      // ==========================================
      // BUSCAR CAIXINHAS
      // ==========================================

      const {
        data: caixinhas,
        error: erroCaixinhas,
      } = await supabase
        .from("caixinhas")
        .select(
          "id, nome, saldo"
        );

      if (
        erroCaixinhas
      ) {
        throw erroCaixinhas;
      }

      if (
        !caixinhas ||
        caixinhas.length === 0
      ) {
        return res.json({
          sucesso: true,

          mensagem:
            "Nenhuma caixinha cadastrada para sincronizar.",

          sincronizadas: [],

          ignoradas: [],
        });
      }

      console.log(
        `📦 ${caixinhas.length} caixinhas encontradas.`
      );

      // ==========================================
      // CONTROLE DE SINCRONIZAÇÃO
      // ==========================================

      let {
        data:
          controleSincronizacao,
        error:
          erroControle,
      } = await supabase
        .from("sincronizacoes")
        .select(
          "id, ultima_sincronizacao"
        )
        .eq(
          "id",
          1
        )
        .maybeSingle();

      if (
        erroControle
      ) {
        throw erroControle;
      }

      // ==========================================
      // CRIAR CONTROLE SE NÃO EXISTIR
      // ==========================================

      if (
        !controleSincronizacao
      ) {

        const {
          data:
            novoControle,
          error:
            erroCriarControle,
        } = await supabase
          .from("sincronizacoes")
          .insert([
            {
              id: 1,
              ultima_sincronizacao:
                null,
            },
          ])
          .select()
          .single();

        if (
          erroCriarControle
        ) {
          throw erroCriarControle;
        }

        controleSincronizacao =
          novoControle;
      }

      // ==========================================
      // DATA ATUAL
      // ==========================================

      const agora =
        new Date();

      // ==========================================
      // BUSCAR ÚLTIMOS 3 DIAS
      // ==========================================

      const dataInicio =
        new Date(
          agora
        );

      dataInicio.setDate(
        dataInicio.getDate() - 3
      );

      const dataInicioFormatada =
        dataInicio
          .toISOString()
          .slice(0, 10);

      const dataFimFormatada =
        agora
          .toISOString()
          .slice(0, 10);

      console.log(
        "📅 Período:",
        dataInicioFormatada,
        "até",
        dataFimFormatada
      );

      // ==========================================
      // BUSCAR TRANSAÇÕES
      // ==========================================

      const respostaPierre =
        await pierreRequest(
          "get-transactions",
          {
            startDate:
              dataInicioFormatada,

            endDate:
              dataFimFormatada,

            format:
              "raw",
          }
        );

      const transacoes =
        Array.isArray(
          respostaPierre?.data
        )
          ? respostaPierre.data
          : [];

      console.log(
        `📊 ${transacoes.length} transações encontradas.`
      );

      // ==========================================
      // RESULTADOS
      // ==========================================

      const sincronizadas =
        [];

      const ignoradas =
        [];

      // ==========================================
      // PROCESSAR CADA TRANSAÇÃO
      // ==========================================

      for (
        const transacao of transacoes
      ) {

        // ==========================================
        // ID
        // ==========================================

        const transacaoId =
          transacao.id ||
          transacao.transaction_id ||
          transacao.transactionId;

        // ==========================================
        // DESCRIÇÃO
        // ==========================================

        const descricao =
          String(
            transacao.description ||
            transacao.descricao ||
            ""
          ).trim();

        // ==========================================
        // TIPO
        // ==========================================

        const tipoPierre =
          String(
            transacao.type ||
            ""
          ).toUpperCase();

        // ==========================================
        // VALOR
        // ==========================================

        const valorOriginal =
          Number(
            transacao.amount
          );

        // ==========================================
        // VALIDAÇÃO
        // ==========================================

        if (
          !transacaoId
        ) {

          ignoradas.push({
            motivo:
              "Transação sem ID.",

            descricao,
          });

          continue;
        }

        if (
          !descricao
        ) {

          ignoradas.push({
            transacao_id:
              transacaoId,

            motivo:
              "Transação sem descrição.",
          });

          continue;
        }

        if (
          !Number.isFinite(
            valorOriginal
          ) ||
          valorOriginal === 0
        ) {

          ignoradas.push({
            transacao_id:
              transacaoId,

            descricao,

            motivo:
              "Valor inválido ou igual a zero.",
          });

          continue;
        }

        // ==========================================
        // VERIFICAR DUPLICIDADE
        // ==========================================

        const {
          data:
            movimentacaoExistente,
          error:
            erroMovimentacaoExistente,
        } = await supabase
          .from(
            "movimentacoes_caixinhas"
          )
          .select(
            "id"
          )
          .eq(
            "transacao_pierre_id",
            String(
              transacaoId
            )
          )
          .maybeSingle();

        if (
          erroMovimentacaoExistente
        ) {
          throw erroMovimentacaoExistente;
        }

        if (
          movimentacaoExistente
        ) {

          ignoradas.push({
            transacao_id:
              transacaoId,

            descricao,

            motivo:
              "Transação já sincronizada anteriormente.",
          });

          continue;
        }

        // ==========================================
        // PROCURAR CAIXINHA
        // ==========================================

        const descricaoNormalizada =
          normalizarTexto(
            descricao
          );

        const caixinhaEncontrada =
          caixinhas.find(
            (caixinha) => {

              const nomeCaixinha =
                normalizarTexto(
                  caixinha.nome
                );

              if (
                !nomeCaixinha
              ) {
                return false;
              }

              return (
                descricaoNormalizada.includes(
                  nomeCaixinha
                ) ||
                nomeCaixinha.includes(
                  descricaoNormalizada
                )
              );
            }
          );

        // ==========================================
        // NÃO ENCONTROU CAIXINHA
        // ==========================================

        if (
          !caixinhaEncontrada
        ) {

          ignoradas.push({
            transacao_id:
              transacaoId,

            descricao,

            valor:
              valorOriginal,

            tipoPierre,

            motivo:
              "Nenhuma caixinha compatível encontrada na descrição.",
          });

          console.log(
            "⚠️ Caixinha não encontrada:",
            descricao
          );

          continue;
        }

        console.log(
          "📦 Caixinha encontrada:",
          caixinhaEncontrada.nome,
          "<-",
          descricao
        );

        // ==========================================
        // DEFINIR TIPO
        // ==========================================

        /*
          DEBIT:
          dinheiro saiu da conta bancária
          e entrou na caixinha.

          CREDIT:
          dinheiro entrou na conta bancária
          e saiu da caixinha.
        */

        let tipoMovimentacao;

        if (
          tipoPierre ===
          "DEBIT"
        ) {

          tipoMovimentacao =
            "ENTRADA";

        } else if (
          tipoPierre ===
          "CREDIT"
        ) {

          tipoMovimentacao =
            "SAIDA";

        } else {

          ignoradas.push({
            transacao_id:
              transacaoId,

            descricao,

            tipoPierre,

            motivo:
              `Tipo do Pierre não reconhecido: ${tipoPierre}`,
          });

          continue;
        }

        // ==========================================
        // VALOR ABSOLUTO
        // ==========================================

        const valor =
          Math.abs(
            valorOriginal
          );

        // ==========================================
        // SALDO ATUAL
        // ==========================================

        const saldoAtual =
          Number(
            caixinhaEncontrada.saldo ||
            0
          );

        let novoSaldo;

        if (
          tipoMovimentacao ===
          "ENTRADA"
        ) {

          novoSaldo =
            saldoAtual +
            valor;

        } else {

          novoSaldo =
            saldoAtual -
            valor;
        }

        // ==========================================
        // IMPEDIR SALDO NEGATIVO
        // ==========================================

        if (
          novoSaldo < 0
        ) {

          ignoradas.push({
            transacao_id:
              transacaoId,

            caixinha:
              caixinhaEncontrada.nome,

            descricao,

            valor,

            motivo:
              "A saída deixaria o saldo da caixinha negativo.",
          });

          continue;
        }

        // ==========================================
        // INSERIR MOVIMENTAÇÃO
        // ==========================================

        console.log(
          "➡️ TENTANDO SINCRONIZAR:",
          {
            caixinha:
              caixinhaEncontrada.nome,

            tipo:
              tipoMovimentacao,

            valor,

            transacaoId,

            descricao,
          }
        );

        const {
          data:
            movimentacao,
          error:
            erroInsercao,
        } = await supabase
          .from(
            "movimentacoes_caixinhas"
          )
          .insert([
            {
              caixinha_id:
                caixinhaEncontrada.id,

              tipo:
                tipoMovimentacao,

              valor,

              descricao:
                `Pierre: ${descricao}`,

              transacao_pierre_id:
                String(
                  transacaoId
                ),
            },
          ])
          .select()
          .single();

        if (
          erroInsercao
        ) {

          if (
            erroInsercao.code ===
            "23505"
          ) {

            ignoradas.push({
              transacao_id:
                transacaoId,

              descricao,

              motivo:
                "Transação já existente no banco.",
            });

            continue;
          }

          throw erroInsercao;
        }

        // ==========================================
        // ATUALIZAR SALDO
        // ==========================================

        const {
          data:
            caixinhaAtualizada,
          error:
            erroAtualizacao,
        } = await supabase
          .from(
            "caixinhas"
          )
          .update({
            saldo:
              novoSaldo,

            updated_at:
              new Date().toISOString(),
          })
          .eq(
            "id",
            caixinhaEncontrada.id
          )
          .select()
          .single();

        if (
          erroAtualizacao
        ) {
          throw erroAtualizacao;
        }

        // ==========================================
        // ATUALIZAR MEMÓRIA
        // ==========================================

        caixinhaEncontrada.saldo =
          Number(
            caixinhaAtualizada.saldo ||
            0
          );

        // ==========================================
        // REGISTRAR SUCESSO
        // ==========================================

        sincronizadas.push({
          transacao_id:
            transacaoId,

          caixinha:
            caixinhaEncontrada.nome,

          tipo:
            tipoMovimentacao,

          valor,

          saldoAnterior:
            saldoAtual,

          saldoAtual:
            caixinhaEncontrada.saldo,

          descricao,
        });
      }

      // ==========================================
      // ATUALIZAR ÚLTIMA SINCRONIZAÇÃO
      // ==========================================

      const {
        error:
          erroSalvarSincronizacao,
      } = await supabase
        .from(
          "sincronizacoes"
        )
        .update({
          ultima_sincronizacao:
            agora.toISOString(),
        })
        .eq(
          "id",
          1
        );

      if (
        erroSalvarSincronizacao
      ) {
        throw erroSalvarSincronizacao;
      }

      // ==========================================
      // LOG FINAL
      // ==========================================

      console.log(
        `✅ ${sincronizadas.length} movimentações sincronizadas.`
      );

      console.log(
        `⚠️ ${ignoradas.length} movimentações ignoradas.`
      );

      // ==========================================
      // RESPOSTA
      // ==========================================

      res.json({
        sucesso:
          true,

        mensagem:
          "Sincronização concluída.",

        periodoBusca: {
          inicio:
            dataInicioFormatada,

          fim:
            dataFimFormatada,
        },

        totalEncontradas:
          transacoes.length,

        totalSincronizadas:
          sincronizadas.length,

        totalIgnoradas:
          ignoradas.length,

        sincronizadas,

        ignoradas,

        ultima_sincronizacao:
          agora.toISOString(),
      });

    } catch (erro) {

      console.error(
        "❌ Erro ao sincronizar caixinhas:",
        erro.message
      );

      res.status(500).json({
        sucesso: false,
        erro:
          erro.message,
      });
    }
  }
);

// ==========================================
// ADICIONAR RENDIMENTO À CAIXINHA
// ==========================================

app.post(
  "/api/caixinhas/:id/rendimento",
  async (req, res) => {
    try {

      const { id } =
        req.params;

      const {
        valor,
        descricao,
      } = req.body;

      const valorNumerico =
        Number(valor);

      if (
        !Number.isFinite(
          valorNumerico
        ) ||
        valorNumerico <= 0
      ) {
        return res.status(400).json({
          sucesso: false,

          erro:
            "O valor do rendimento deve ser maior que zero.",
        });
      }

      // ==========================================
      // BUSCAR CAIXINHA
      // ==========================================

      const {
        data: caixinha,
        error:
          erroCaixinha,
      } = await supabase
        .from(
          "caixinhas"
        )
        .select(
          "id, nome, saldo"
        )
        .eq(
          "id",
          id
        )
        .single();

      if (
        erroCaixinha ||
        !caixinha
      ) {
        return res.status(404).json({
          sucesso: false,

          erro:
            "Caixinha não encontrada.",
        });
      }

      // ==========================================
      // REGISTRAR RENDIMENTO
      // ==========================================

      const {
        data:
          rendimento,
        error:
          erroRendimento,
      } = await supabase
        .from(
          "rendimentos_caixinhas"
        )
        .insert([
          {
            caixinha_id:
              id,

            valor:
              valorNumerico,

            descricao:
              descricao?.trim() ||
              "Rendimento",
          },
        ])
        .select()
        .single();

      if (
        erroRendimento
      ) {
        throw erroRendimento;
      }

      // ==========================================
      // ATUALIZAR SALDO
      // ==========================================

      const saldoAtual =
        Number(
          caixinha.saldo
        ) || 0;

      const novoSaldo =
        saldoAtual +
        valorNumerico;

      const {
        data:
          caixinhaAtualizada,
        error:
          erroAtualizacao,
      } = await supabase
        .from(
          "caixinhas"
        )
        .update({
          saldo:
            novoSaldo,

          updated_at:
            new Date().toISOString(),
        })
        .eq(
          "id",
          id
        )
        .select()
        .single();

      if (
        erroAtualizacao
      ) {
        throw erroAtualizacao;
      }

      // ==========================================
      // RESPOSTA
      // ==========================================

      res.json({
        sucesso: true,

        mensagem:
          "Rendimento adicionado com sucesso.",

        rendimento,

        caixinha:
          caixinhaAtualizada,
      });

    } catch (erro) {

      console.error(
        "Erro ao adicionar rendimento:",
        erro.message
      );

      res.status(500).json({
        sucesso: false,
        erro:
          erro.message,
      });
    }
  }
);

// ==========================================
// EDITAR CAIXINHA
// ==========================================

app.put(
  "/api/caixinhas/:id",
  async (req, res) => {
    try {

      const { id } =
        req.params;

      const {
        nome,
        meta,
        descricao,
      } = req.body;

      if (
        !nome ||
        meta === undefined
      ) {
        return res.status(400).json({
          sucesso: false,

          erro:
            "Nome e meta são obrigatórios.",
        });
      }

      const metaNumerica =
        Number(meta);

      if (
        !Number.isFinite(
          metaNumerica
        ) ||
        metaNumerica <= 0
      ) {
        return res.status(400).json({
          sucesso: false,

          erro:
            "A meta deve ser maior que zero.",
        });
      }

      const {
        data,
        error,
      } = await supabase
        .from(
          "caixinhas"
        )
        .update({
          nome:
            nome.trim(),

          meta:
            metaNumerica,

          descricao:
            descricao?.trim() ||
            null,

          updated_at:
            new Date().toISOString(),
        })
        .eq(
          "id",
          id
        )
        .select()
        .single();

      if (
        error
      ) {
        throw error;
      }

      res.json({
        sucesso: true,

        mensagem:
          "Caixinha atualizada com sucesso.",

        caixinha:
          data,
      });

    } catch (erro) {

      console.error(
        "Erro ao editar caixinha:",
        erro.message
      );

      res.status(500).json({
        sucesso: false,
        erro:
          erro.message,
      });
    }
  }
);

// ==========================================
// EXCLUIR CAIXINHA
// ==========================================

app.delete(
  "/api/caixinhas/:id",
  async (req, res) => {
    try {

      const { id } =
        req.params;

      // ==========================================
      // EXCLUIR MOVIMENTAÇÕES
      // ==========================================

      const {
        error:
          erroMovimentacoes,
      } = await supabase
        .from(
          "movimentacoes_caixinhas"
        )
        .delete()
        .eq(
          "caixinha_id",
          id
        );

      if (
        erroMovimentacoes
      ) {
        throw erroMovimentacoes;
      }

      // ==========================================
      // EXCLUIR CAIXINHA
      // ==========================================

      const {
        data,
        error,
      } = await supabase
        .from(
          "caixinhas"
        )
        .delete()
        .eq(
          "id",
          id
        )
        .select()
        .single();

      if (
        error
      ) {
        throw error;
      }

      res.json({
        sucesso: true,

        mensagem:
          "Caixinha excluída com sucesso.",

        caixinha:
          data,
      });

    } catch (erro) {

      console.error(
        "Erro ao excluir caixinha:",
        erro.message
      );

      res.status(500).json({
        sucesso: false,
        erro:
          erro.message,
      });
    }
  }
);

// ==========================================
// ABRIR O SITE
// ==========================================

app.use(
  (req, res) => {
    res.sendFile(
      path.join(
        __dirname,
        "public",
        "index.html"
      )
    );
  }
);

// ==========================================
// INICIAR SERVIDOR
// ==========================================

app.listen(
  PORT,
  () => {

    console.log("");

    console.log(
      "================================="
    );

    console.log(
      "      MEU APP FINANCEIRO"
    );

    console.log(
      "================================="
    );

    console.log("");

    console.log(
      `Servidor: http://localhost:${PORT}`
    );

    console.log("");

    console.log(
      "Conexão com o Pierre preparada."
    );

    console.log("");
  }
);