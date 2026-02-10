const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.server = {
  ...config.server,
  enhanceMiddleware: (middleware) => {
    return (req, res, next) => {
      if (req.url === "/status") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("OK");
        return;
      }
      return middleware(req, res, next);
    };
  },
};

module.exports = config;
