require("dotenv").config();

const API_URL = "https://www.pierre.finance/tools/api/get-accounts";

async function testar() {
  try {
    const resposta = await fetch(API_URL, {
      headers: {
        Authorization: `Bearer ${process.env.PIERRE_API_KEY}`,
      },
    });

    const dados = await resposta.json();

    if (!resposta.ok) {
      console.log("Erro:", resposta.status);
      return;
    }

    console.log("\n====================================");
    console.log("     DIAGNÓSTICO DO PIERRE");
    console.log("====================================\n");

    console.log(`Total de registros: ${dados.data?.length || 0}\n`);

    dados.data.forEach((conta, index) => {
      console.log(`REGISTRO ${index + 1}`);
      console.log("------------------------------------");

      console.log("Tipo:", conta.type || "N/A");
      console.log("Subtipo:", conta.subtype || "N/A");

      console.log(
        "Tem dados de crédito:",
        conta.creditData ? "SIM" : "NÃO"
      );

      console.log(
        "Tem dados bancários:",
        conta.bankData ? "SIM" : "NÃO"
      );

      console.log(
        "É ativo:",
        conta.itemIsActive ? "SIM" : "NÃO"
      );

      console.log("");
    });

    console.log("====================================");
    console.log("      FIM DO DIAGNÓSTICO");
    console.log("====================================");
  } catch (erro) {
    console.error("Erro:", erro.message);
  }
}

testar();