import json,time
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
class Model(BaseHTTPRequestHandler):
    def log_message(self,*args): pass
    def do_POST(self):
        body=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        with Path('.dev/nma-012/requests.jsonl').open('a') as f: f.write(json.dumps(body)+'\n')
        text=next((m.get('content','') for m in reversed(body.get('messages',[])) if m['role']=='user'),'')
        text=text.split('\n\n')[-1]
        if text == 'FAIL_PROVIDER':
            self.send_response(401); self.end_headers(); self.wfile.write(b'{"error":{"message":"Synthetic denial","type":"authentication_error"}}'); return
        answer='Saya sudah membaca pesanmu. Mari kita susun langkah berikutnya dengan jelas. Jawaban ini berasal dari model lokal untuk memverifikasi percakapan.'
        self.send_response(200);self.send_header('Content-Type','text/event-stream');self.end_headers()
        try:
            for i,part in enumerate([answer[:40],answer[40:85],answer[85:]]):
                if i: time.sleep(12 if 'LAMBAT' in text else 0.5)
                chunk={'id':'local','choices':[{'index':0,'delta':{'content':part},'finish_reason':None}]}
                self.wfile.write(('data: '+json.dumps(chunk)+'\n\n').encode());self.wfile.flush()
            self.wfile.write(b'data: {"id":"local","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');self.wfile.flush()
        except (BrokenPipeError,ConnectionResetError): pass
ThreadingHTTPServer(('127.0.0.1',8012),Model).serve_forever()
