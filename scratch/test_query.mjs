import { retrieveHybridContext } from '../server/src/services/research/hybridRetriever.js';

async function test() {
  console.log('--- Testing "European unity report findings" ---');
  const res = await retrieveHybridContext({ query: 'European unity report findings', limit: 8 });
  console.log('Retained Articles:');
  for (const a of res.articles) {
    console.log(`- Score: ${a.compositeScore?.toFixed(3)} | sSem: ${a.sSemantic?.toFixed(3)} | sLex: ${a.sLexical?.toFixed(3)} | Title: ${a.title}`);
  }
  console.log('\nRetained Events:');
  for (const e of res.events) {
    console.log(`- Score: ${e.compositeScore?.toFixed(3)} | sSem: ${e.sSemantic?.toFixed(3)} | sLex: ${e.sLexical?.toFixed(3)} | Title: ${e.title}`);
  }
}

test().catch(err => {
  console.error(err);
  process.exit(1);
});
