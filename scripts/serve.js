const http = require("http");
const os = require("os");
const path = require("path");
const fs = require("fs");

const root = path.resolve(__dirname, "..");
const port = Number(process.env.PORT || 4173);

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
};

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const normalized = path.normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(root, normalized === "/" ? "index.html" : normalized);
  if (!filePath.startsWith(root)) return null;
  return filePath;
}

function listLanUrls() {
  const urls = [`http://localhost:${port}`];
  const nets = os.networkInterfaces();
  Object.values(nets).flat().forEach((net) => {
    if (!net || net.family !== "IPv4" || net.internal) return;
    urls.push(`http://${net.address}:${port}`);
  });
  return urls;
}

const server = http.createServer((req, res) => {
  const requested = safePath(req.url || "/");
  if (!requested) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  const filePath = fs.existsSync(requested) && fs.statSync(requested).isDirectory()
    ? path.join(requested, "index.html")
    : requested;

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath);
    res.writeHead(200, {
      "Content-Type": types[ext] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(content);
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log("AI 发电产业题库已启动：");
  listLanUrls().forEach((url) => console.log(`  ${url}`));
  console.log("");
  console.log("手机访问：让手机和电脑连接同一个 Wi-Fi，然后打开上面的局域网地址。");
  console.log("手机桌面图标：用手机浏览器打开后，选择“添加到主屏幕”。");
  console.log("停止服务：在这个终端按 Ctrl+C。");
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`端口 ${port} 已被占用。可以换一个端口运行：PORT=4174 npm start`);
    process.exit(1);
  }
  throw error;
});
