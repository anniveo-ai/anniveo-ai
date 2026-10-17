/* Local-only wallet and container fixtures. Never used by the application. */
const vm=require('node:vm');
function fund(raw,user,coins=100000){
 raw.exec(require('node:fs').readFileSync('payments.sql','utf8'));
 const order='fixture-order-'+user,charge='fixture-charge-'+user;
 raw.prepare('INSERT OR IGNORE INTO payment_orders(id,user_id,coins,stars,created_at,expires_at) VALUES(?,?,?,?,0,9999999999)').run(order,String(user),coins,coins*3);
 raw.prepare('INSERT OR IGNORE INTO payment_receipts(charge_id,order_id,user_id,coins,stars,paid_at) VALUES(?,?,?,?,?,0)').run(charge,order,String(user),coins,coins*3);
}
function videoFile(seconds=10,version=0){
 const head=Buffer.alloc(16);head.writeUInt32BE(16);head.write('ftyp',4);head.write('mp42',8);
 const movie=Buffer.alloc(version===1?40:28);movie.writeUInt32BE(movie.length);movie.write('mvhd',4);movie[8]=version;
 const offset=version===1?28:20;movie.writeUInt32BE(1000,offset);if(version===1)movie.writeBigUInt64BE(BigInt(Math.round(seconds*1000)),offset+4);else movie.writeUInt32BE(Math.round(seconds*1000),offset+4);
 const box=Buffer.alloc(8);box.writeUInt32BE(movie.length+8);box.write('moov',4);
 return new File([head,box,movie],'fixture.mp4',{type:'video/mp4'});
}
async function accept(context,body,file=null){
 context.testPriceBody=body;context.testPriceFile=file;
 const quote=await vm.runInContext('(async()=>mediaPrice(env,testPriceBody,{type:testPriceFile?.type||"",duration:testPriceFile?.type.startsWith("video/")?await billingVideoDuration(testPriceFile):0}))()',context);
 return {...body,acceptedPrice:quote.amount,acceptedTariff:quote.version,acceptedModel:quote.model};
}
module.exports={fund,videoFile,accept};
