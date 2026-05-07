const axios = require("axios");
const cheerio = require("cheerio");

async function run() {
  const response = await axios.get("https://example.com");

  const $ = cheerio.load(response.data);

  console.log($("h1").text());
}

run();

console.log("bonjour");