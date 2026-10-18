// Node-only render harness: Next compiles CSS Modules during the application build.
// Keep class names inspectable without loading a stylesheet as JavaScript.
require.extensions[".css"] = (loaded, filename) => {
  if (!filename.endsWith(".module.css")) {
    throw new Error(`Only CSS Modules are supported in the render harness: ${filename}`);
  }
  loaded.exports = {
    __esModule: true,
    default: new Proxy({}, { get: (_, key) => String(key) }),
  };
};
