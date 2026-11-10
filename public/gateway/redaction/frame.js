const page = document.querySelector("#lr-app");

new ResizeObserver(() => {
  parent.postMessage({
    type: "gateway-preview-height",
    height: Math.ceil(page.getBoundingClientRect().height),
  }, location.origin);
}).observe(page);
