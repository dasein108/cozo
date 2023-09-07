// console.log("Config overrides is being called!");

// const { override } = require("customize-cra");

// module.exports = override((config) => {
//   // Add fallbacks for buffer and stream
//   config.resolve.fallback = {
//     ...config.resolve.fallback,
//     "node:buffer": false,
//     buffer: require.resolve("buffer/"),
//     stream: require.resolve("stream-browserify"),
//   };
//   return config;
// });
const webpack = require("webpack");
module.exports = function override(config, env) {
  config.resolve.fallback = {
    url: require.resolve("url"),
    assert: require.resolve("assert"),
    buffer: require.resolve("buffer"),
  };
  config.plugins.push(
    new webpack.ProvidePlugin({
      process: "process/browser",
      Buffer: ["buffer", "Buffer"],
    }),
    new webpack.NormalModuleReplacementPlugin(/node:/, (resource) => {
      const mod = resource.request.replace(/^node:/, "");
      switch (mod) {
        case "buffer":
          resource.request = "buffer";
          break;
        case "stream":
          resource.request = "readable-stream";
          break;
        default:
          throw new Error(`Not found ${mod}`);
      }
    })
  );

  return config;
};
