const minify = require("rehype-minify-whitespace");

const { h, wrapText } = require("./utils");

const toSelector = ({ tagName, properties: { id, className, ...rest } }) =>
  [
    tagName,
    id ? "#" + id : "",
    className && className.length > 0 ? "." + className.join(".") : "",
    Object.entries(rest)
      .map(([key, value]) => `[${key}${value === "" ? "" : `="${value}"`}]`)
      .join(""),
  ].join("");

const asArray = (v) => (v ? (Array.isArray(v) ? v : [v]) : []);

const isExhaustive = (source, required, optional) => {
  const sourceSet = new Set(source);
  for (const key of asArray(required)) {
    if (!sourceSet.delete(key)) {
      return false;
    }
  }
  for (const key of asArray(optional)) {
    if (typeof key == "function") {
      const matches = Array.from(sourceSet).filter((k) => key(k));
      for (const match of matches) {
        sourceSet.delete(match);
      }
    } else {
      sourceSet.delete(key);
    }
  }
  return sourceSet.size == 0;
};

const isHandled = (node, check) => {
  if (typeof check == "function") {
    return check(node);
  }

  if (node.type !== "element") {
    return false;
  }

  const isArray = Array.isArray(check);
  if (isArray || typeof check == "string") {
    return (isArray ? check : [check]).includes(toSelector(node));
  }

  if (
    check.is &&
    !asArray(check.is).some((tagName) => node.tagName == tagName)
  ) {
    return false;
  }

  const { className, ...props } = node.properties;
  return (
    isExhaustive(Object.keys(props), check.has, check.canHave) &&
    isExhaustive(className, check.hasClass, check.canHaveClass)
  );
};

function transformNode(node, handlers, opts = {}) {
  const selector = node.type === "element" && toSelector(node);
  const unhandled = [];

  function transformChildren(node, subOpts = {}) {
    const newOpts = { ...opts, ...subOpts };
    if (node.value) {
      return h(node, "text", {}, wrapText(node.value, newOpts));
    } else {
      return (node.children || [])
        .map((child) => {
          const [transformed, childUnhandled] = transformNode(
            child,
            handlers,
            newOpts
          );
          unhandled.push(...childUnhandled);
          return transformed;
        })
        .flat();
    }
  }

  let transformed = null;
  const handler = handlers.find(([check]) => isHandled(node, check));
  if (handler) {
    const handle = handler[1];
    transformed = handle(node, transformChildren, opts);
  } else if (selector) {
    unhandled.push(selector);
  }

  return [transformed || transformChildren(node), unhandled];
}

function toMdast(tree, handlers) {
  minify({ newlines: true })(tree);
  return transformNode(tree, handlers);
}

// If a destination is given, runs the destination with the new mdast tree
// (bridge-mode).
// Without destination, returns the mdast tree: further plugins run on that tree
// (mutate-mode).
function transform(destination, options) {
  let settings;

  if (destination && !destination.process) {
    settings = destination;
    destination = null;
  }

  settings = settings || options || {};

  return destination
    ? function transformer(node, file, next) {
        destination.run(toMdast(node, settings), file, (err) => next(err));
      }
    : (node) => toMdast(node, settings);
}

module.exports = { transform };