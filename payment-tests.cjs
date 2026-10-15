const {DatabaseSync}=require('node:sqlite');
const vm=require('node:vm');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const raw=new DatabaseSync(':memory:');
raw.exec(fs.readFileSync('payments.sql','utf8'));
const db={prepare(sql){return{bind(...params){return{
  async first(){return raw.prepare(sql).get(...params)||null},
  async all(){return{results:raw.prepare(sql).all(...params)}},
  async run(){const r=raw.prepare(sql).run(...params);return{meta:{changes:Number(r.changes)}}}
}}}},async batch(ops){raw.exec('BEGIN');try{const r=[];for(const op of ops)r.push(await op.run());raw.exec('COMMIT');return r}catch(e){raw.exec('ROLLBACK');throw e}}};
const calls=[];
const context=vm.createContext({crypto:require('node:crypto').webcrypto,TextEncoder,AbortSignal,Response,Request,console,
 fetch:async(url,opts)=>{const method=url.split('/').pop();const body=JSON.parse(opts.body);calls.push({method,body});return Response.json({ok:true,result:method==='getWebhookInfo'?{url:'https://anniveo-ai-api.yaylaevismail.workers.dev/telegram/payments'}:method==='createInvoiceLink'?'https://t.me/$test':true})}});
const code=fs.readFileSync('worker.js','utf8');
vm.runInContext(code.slice(0,code.indexOf('export default')),context);
context.env={DB:db,TELEGRAM_BOT_TOKEN:'test-only-token'};
const run=code=>vm.runInContext(code,context);
(async()=>{
 assert.equal((await run("createWalletInvoice(env,'123','invalid')")).status,400);
 const invoice=await run("createWalletInvoice(env,'123','coins500')");
 assert.equal(invoice.stars,499);assert.equal(invoice.coins,500);
 assert.equal(calls.at(-1).body.currency,'XTR');assert.equal(calls.at(-1).body.prices[0].amount,499);
 const order=invoice.orderId;
 const q={pre_checkout_query:{id:'q1',from:{id:123},invoice_payload:order,currency:'XTR',total_amount:499}};
 async function update(u){context.update=u;await run('handlePaymentUpdate(update,env)')}
 await update(q);assert.equal(calls.at(-1).body.ok,true);
 await update(q);assert.equal(calls.at(-1).body.ok,true);
 await update({pre_checkout_query:{...q.pre_checkout_query,id:'q2'}});assert.equal(calls.at(-1).body.ok,false);
 await update({pre_checkout_query:{...q.pre_checkout_query,from:{id:999}}});assert.equal(calls.at(-1).body.ok,false);
 await update({pre_checkout_query:{...q.pre_checkout_query,total_amount:1}});assert.equal(calls.at(-1).body.ok,false);
 assert.equal((await run("readWallet(env.DB,'123')")).balance,0,'precheckout never credits');
 const paid={message:{from:{id:123},date:1700000000,successful_payment:{invoice_payload:order,currency:'XTR',total_amount:499,telegram_payment_charge_id:'charge1'}}};
 await update(paid);await update(paid);
 let wallet=await run("readWallet(env.DB,'123')");assert.equal(wallet.balance,500);assert.equal(wallet.history.length,1);
 assert.equal((await run("readWallet(env.DB,'999')")).balance,0);
 await update({message:{...paid.message,from:{id:999}}});assert.equal((await run("readWallet(env.DB,'999')")).balance,0);
 await update(q);assert.equal(calls.at(-1).body.ok,false,'paid order cannot be purchased again');
 await update({message:{date:1700000100,refunded_payment:paid.message.successful_payment}});
 assert.equal((await run("readWallet(env.DB,'123')")).balance,0);
 await update(paid);assert.equal((await run("readWallet(env.DB,'123')")).balance,0,'replayed credit cannot undo refund');
 context.req=new Request('https://example.com/telegram/payments',{method:'POST',body:JSON.stringify(paid)});
 assert.equal((await run('handlePaymentWebhook(req,env)')).status,403);
 const secret=await run('paymentWebhookSecret(env)');
 context.req=new Request('https://example.com/telegram/payments',{method:'POST',headers:{'X-Telegram-Bot-Api-Secret-Token':secret},body:JSON.stringify(paid)});
 assert.equal((await run('handlePaymentWebhook(req,env)')).status,200);
 const early=await run("createWalletInvoice(env,'123','coins100')");
 const earlyPayment={invoice_payload:early.orderId,currency:'XTR',total_amount:99,telegram_payment_charge_id:'early-refund'};
 await update({message:{date:1700000200,refunded_payment:earlyPayment}});
 await update({message:{from:{id:123},date:1700000100,successful_payment:earlyPayment}});
 assert.equal((await run("readWallet(env.DB,'123')")).balance,0,'out-of-order refund must prevent later credit');
 const expired=await run("createWalletInvoice(env,'123','coins1000')");
 raw.prepare('UPDATE payment_orders SET expires_at=1 WHERE id=?').run(expired.orderId);
 await update({pre_checkout_query:{...q.pre_checkout_query,id:'expired',invoice_payload:expired.orderId,total_amount:999}});
 assert.equal(calls.at(-1).body.ok,false);
 const scripts=[...fs.readFileSync('index.html','utf8').matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
 for(const script of scripts)new vm.Script(script);
 console.log('PASS: invoice tariff, auth boundaries, precheckout reservation, receipt idempotency, refunds, webhook signature and frontend syntax');
})().catch(e=>{console.error(e);process.exitCode=1});
