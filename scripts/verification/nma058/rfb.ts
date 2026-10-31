import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";

function crc(bytes: Uint8Array) {
  let value = 0xffffffff;
  for (const byte of bytes) { value ^= byte; for (let i=0;i<8;i++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0); }
  return (value ^ 0xffffffff) >>> 0;
}
function chunk(name: string, bytes: Buffer) {
  const type = Buffer.from(name); const length = Buffer.alloc(4); length.writeUInt32BE(bytes.length);
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc(Buffer.concat([type, bytes])));
  return Buffer.concat([length,type,bytes,checksum]);
}
export async function captureRfb(url: string, origin?: string) {
  const ws = new WebSocket(url, origin ? { headers: { Origin: origin } } : {});
  ws.binaryType = "arraybuffer";
  let bytes = Buffer.alloc(0), wake = () => {}, failed = false;
  ws.onmessage = (event) => { bytes = Buffer.concat([bytes, Buffer.from(event.data as ArrayBuffer)]); wake(); };
  ws.onclose = ws.onerror = () => { failed=true; wake(); };
  const timer = setTimeout(() => ws.close(), 15000);
  async function take(count: number) {
    while(bytes.length < count) { if(failed) throw new Error("RFB disconnected"); await new Promise<void>(resolve=>{wake=resolve;}); }
    const value=bytes.subarray(0,count); bytes=bytes.subarray(count); return value;
  }
  try {
    assert.equal((await take(12)).toString(), "RFB 003.008\n"); ws.send(Buffer.from("RFB 003.008\n"));
    const count=(await take(1))[0]; const types=await take(count); assert(types.includes(1)); ws.send(new Uint8Array([1]));
    assert.equal((await take(4)).readUInt32BE(),0); ws.send(new Uint8Array([1]));
    const init=await take(24); const width=init.readUInt16BE(),height=init.readUInt16BE(2); const name=(await take(init.readUInt32BE(20))).toString();
    // Client requests little-endian 32-bit BGRX pixels and raw rectangles only.
    ws.send(new Uint8Array([0,0,0,0,32,24,0,1,0,255,0,255,0,255,16,8,0,0,0,0]));
    ws.send(new Uint8Array([2,0,0,1,0,0,0,0]));
    const request=Buffer.alloc(10);request[0]=3;request.writeUInt16BE(width,6);request.writeUInt16BE(height,8);ws.send(request);
    const rgba=Buffer.alloc(width*height*3); let rectangles=0;
    while(!rectangles) {
      const type=(await take(1))[0];
      if(type===2) continue;
      if(type===3) { const header=await take(7); await take(header.readUInt32BE(3));continue; }
      assert.equal(type,0); const update=await take(3); const count=update.readUInt16BE(1);
      for(let i=0;i<count;i++) {
        const r=await take(12); const x=r.readUInt16BE(),y=r.readUInt16BE(2),w=r.readUInt16BE(4),h=r.readUInt16BE(6),encoding=r.readInt32BE(8);
        assert.equal(encoding,0); const raw=await take(w*h*4);
        for(let row=0;row<h;row++) for(let col=0;col<w;col++) { const src=(row*w+col)*4,dst=((row+y)*width+col+x)*3;rgba[dst]=raw[src+2];rgba[dst+1]=raw[src+1];rgba[dst+2]=raw[src]; }
        rectangles++;
      }
    }
    const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;
    const scan=Buffer.alloc((width*3+1)*height);for(let row=0;row<height;row++) rgba.copy(scan,row*(width*3+1)+1,row*width*3,(row+1)*width*3);
    const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",header),chunk("IDAT",deflateSync(scan)),chunk("IEND",Buffer.alloc(0))]);
    return { width,height,name,rectangles,png };
  } finally { clearTimeout(timer);ws.close(); }
}
