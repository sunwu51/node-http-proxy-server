const http = require('http');
const net = require('net');
const url = require('url');

// 设置用户名和密码
const args = process.argv.slice(2);
let username = null;
let password = null;

// 检查命令行参数
if (args.length >= 2) {
  username = args[0];
  password = args[1];
}

// 认证函数
function authenticate(req) {
    if (!username || !password) {
        // 如果没有设置用户名和密码，不进行权限校验
        return true;
    }
    try {
        const authheader = req.headers['proxy-authorization'];
        if (!authheader) {
            console.error('No Proxy-Authorization header provided');
            return false;
        }

        const auth = new Buffer.from(authheader.split(' ')[1],
            'base64').toString().split(':');
        const user = auth[0];
        const pass = auth[1];
        return user === user && pass === pass;
    } catch (e) {
        console.error(e);
        return false;
    }
}

// 创建HTTP服务器
const server = http.createServer((req, res) => {
  // 检查认证
  if (!authenticate(req)) {
    res.writeHead(401, {
      'WWW-Authenticate': 'Basic realm="Proxy"'
    });
    return res.end('Authentication required.');
  }

  // 处理HTTP请求
  if (req.method === 'GET') {
    console.log('HTTP request for:', req.url);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('This is an authenticated HTTP proxy server');
  }
});

// 处理CONNECT方法（用于HTTPS和WebSocket）
server.on('connect', (req, clientSocket, head) => {
  // 检查认证
  if (!authenticate(req)) {
    clientSocket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    return clientSocket.end();
  }

  const { port, hostname } = url.parse(`//${req.url}`, false, true);

  console.log('Proxying to:', hostname, port);

  const serverSocket = net.connect(port || 443, hostname, () => {
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n' +
                       'Proxy-agent: Node.js-Proxy\r\n' +
                       '\r\n');
    serverSocket.write(head);
    serverSocket.pipe(clientSocket);
    clientSocket.pipe(serverSocket);
  });

  serverSocket.on('error', (err) => {
    console.error('Error connecting to server:', err);
    clientSocket.end();
  });

  clientSocket.on('error', (err) => {
    console.error('Client socket error:', err);
    serverSocket.end();
  });
});

// 处理WebSocket升级请求
server.on('upgrade', (req, socket, head) => {
  // 检查认证
  if (!authenticate(req)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    return socket.end();
  }

  const { port, hostname } = url.parse(req.url);

  console.log('WebSocket upgrade request for:', hostname, port);

  const options = {
    port: port || 80,
    hostname: hostname,
    method: 'GET',
    path: '/',
    headers: req.headers
  };

  const proxyReq = http.request(options);
  proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
    socket.write('HTTP/1.1 101 Switching Protocols\r\n' +
                 'Upgrade: websocket\r\n' +
                 'Connection: Upgrade\r\n' +
                 '\r\n');

    proxySocket.pipe(socket);
    socket.pipe(proxySocket);
  });

  proxyReq.on('error', (err) => {
    console.error('Error in proxy request:', err);
    socket.end();
  });

  proxyReq.end();
});

// 启动服务器
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Proxy server running on localhost:${PORT}`);
});
