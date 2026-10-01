// Local receipt sink only. Raw MIME and confirmation links stay ignored/private.
import {createServer as tcpServer} from 'node:net';
import {createServer as httpServer} from 'node:http';
import fs from 'node:fs/promises';
export async function localSmtp(dir,{sandbox=false}={}){
  if(!sandbox || process.env.NODE_ENV==='production')throw Error('Local SMTP forbidden outside explicit non-production sandbox');
  let outage=false;const messages=[];
  const smtp=tcpServer(socket=>{
    let input='',data=false,body='',recipient='';socket.setEncoding('utf8');socket.write('220 local.synthetic.test ESMTP\r\n');
    socket.on('data',chunk=>{
      input+=chunk;let at;
      while((at=input.indexOf('\r\n'))>=0){
        const line=input.slice(0,at);input=input.slice(at+2);
        if(data){if(line==='.'){
          data=false;messages.push({recipient,mime:body,at:Date.now()});body='';
          fs.writeFile(dir+'/mail.private.json',JSON.stringify(messages)).then(()=>socket.write('250 stored locally\r\n')).catch(()=>socket.write('451 local receipt failed\r\n'));
        }else body+=line.replace(/^\.\./,'.')+'\r\n';continue;}
        if(/^(EHLO|HELO)/i.test(line))socket.write('250-local.synthetic.test\r\n250 8BITMIME\r\n');
        else if(/^MAIL FROM:/i.test(line))socket.write(outage?'451 Synthetic SMTP outage\r\n':'250 sender accepted\r\n');
        else if(/^RCPT TO:/i.test(line)){recipient=line.match(/<([^>]+)>/)?.[1]??'';socket.write('250 recipient accepted\r\n');}
        else if(/^DATA$/i.test(line)){data=true;socket.write('354 data\r\n');}
        else if(/^QUIT$/i.test(line)){socket.end('221 bye\r\n');}
        else socket.write('250 ok\r\n');
      }
    });socket.on('error',()=>{});
  });
  const templates=httpServer(async(req,res)=>{
    const file=req.url==='/confirmation'?'confirmation.html':req.url==='/recovery'?'recovery.html':null;
    if(!file){res.writeHead(404);res.end();return;}
    res.setHeader('content-type','text/html; charset=utf-8');res.end(await fs.readFile('services/auth-email/'+file));
  });
  await Promise.all([new Promise(resolve=>smtp.listen(8795,'127.0.0.1',resolve)),new Promise(resolve=>templates.listen(8796,'127.0.0.1',resolve))]);
  return {setOutage:value=>{outage=value;},close:()=>{smtp.close();templates.close();}};
}
export function mimeHtml(mime){
  const stripped=mime.replace(/=\r?\n/g,'');
  // GoTrue/gomail emits quoted-printable HTML. Decode bytes, not arbitrary URL text.
  const bytes=[];for(let i=0;i<stripped.length;i++){if(stripped[i]==='=' && /^[0-9a-f]{2}$/i.test(stripped.slice(i+1,i+3))){bytes.push(parseInt(stripped.slice(i+1,i+3),16));i+=2;}else bytes.push(...Buffer.from(stripped[i]));}
  return Buffer.from(bytes).toString('utf8').replace(/&amp;/g,'&');
}
