/* One disclosure/flyout pattern for every module. Navigation never starts a scan. */
(() => {
  const modules = [
    { id: "chat", name: "AI Chat", direct: true },
    { id: "guard", name: "AI Guard", direct: true },
    {
      id: "scanner",
      name: "AI Scanner",
      items: [
        { name: "Standard Scan", route: "#scanner" },
        { name: "Agentic Scan", route: "#agentic", note: "Advanced" },
      ],
    },
    {
      id: "gateway",
      name: "AI Gateway",
      preview: true,
      groups: [
        {
          name: "Access Control",
          items: [
            {name: 'Review Invoices. Prevent Unauthorized Payments.', route:'#gateway/invoice-payment'},
            {name: 'Check Status, Prevent Database Deletion', route:'#gateway/database-deletion'},
            {name: 'Approved Apps. Approved Models.', route:'#gateway/model-access'},
          ],
        },
        {
          name: "Guardrails",
          items: [
            {name: 'Mask Sensitive Data Before Inference', route:'#gateway/card-redaction'},
            {name: 'Summarize Emails. Block Hidden Instructions.', route:'#gateway/email-injection'},
          ],
        },
        {
          name: "Routing Rules",
          items: [
            {name: 'Primary Model Fails, App Keeps Responding', route:'#gateway/model-fallback'},
          ],
        },
      ],
    },
    { id: "insights", name: "AI Risk Insights", direct: true, tbd: true },
    { id: "blueprint", name: "AI Blueprint", direct: true, tbd: true },
  ];
  const links = (items) =>
    items
      .map(
        (i) =>
          `<a href="${i.route}" data-nav-route="${i.route}">${escapeHtml(i.name)}${i.note ? "<small>" + escapeHtml(i.note) + "</small>" : ""}</a>`,
      )
      .join("");
  const nav = document.getElementById("navigation");
  nav.innerHTML = modules
    .map((m) =>
      m.direct
        ? `<a href="#${m.id}" class="nav-link" data-page="${m.id}">${m.name}${m.tbd ? '<small class="nav-tbd">TBD</small>' : ""}</a>`
        : `<div class="platform-navigation" data-module="${m.id}">
    <button class="nav-link platform-trigger" data-page="${m.id}" aria-expanded="false" aria-controls="platform-panel-${m.id}">${m.name}${m.preview ? '<small class="nav-preview">Preview</small>' : ""}</button>
    <div id="platform-panel-${m.id}" class="platform-dropdown" hidden><nav aria-label="${m.name} navigation">${m.groups ? m.groups.map((g, index) => `<section class="platform-group"><button class="platform-category" aria-expanded="false" aria-controls="platform-child-${m.id}-${index}">${escapeHtml(g.name)}<span aria-hidden="true">›</span></button><div id="platform-child-${m.id}-${index}" class="platform-submenu" hidden><nav aria-label="${escapeHtml(g.name)} use cases">${links(g.items)}</nav></div></section>`).join("") : links(m.items)}</nav></div>
  </div>`,
    )
    .join("");
  const controllers = [];
  for (const menu of nav.querySelectorAll(".platform-navigation")) {
    const trigger = menu.querySelector(".platform-trigger"),
      panel = menu.querySelector(".platform-dropdown"),
      groups = [...menu.querySelectorAll(".platform-group")];
    let timer,
      childTimer,
      hoverOpen = false,
      hoverGroup = null;
    function showGroup(active, hover = false) {
      clearTimeout(childTimer);
      hoverGroup = hover ? active : null;
      for (const group of groups) {
        const child = group.querySelector(".platform-submenu");
        child.hidden = group !== active;
        child.style.top = "";
        group.classList.remove("flyout-left");
        group
          .querySelector(".platform-category")
          .setAttribute("aria-expanded", String(group === active));
      }
      if (active && innerWidth > 720 && innerHeight > 620) {
        const child = active.querySelector(".platform-submenu");
        if (child.getBoundingClientRect().right > innerWidth - 12)
          active.classList.add("flyout-left");
        const rect = child.getBoundingClientRect();
        if (rect.bottom > innerHeight - 12)
          child.style.top = Math.min(0, innerHeight - 12 - rect.bottom) + "px";
      }
    }
    function show(open, hover = false) {
      if (open) {
        for (const c of controllers) if (c.menu !== menu) c.close();
      }
      if (!open || panel.hidden) showGroup(null);
      panel.hidden = !open;
      hoverOpen = open && hover;
      trigger.setAttribute("aria-expanded", String(open));
      if (open) {
        panel.classList.remove("align-right");
        if (
          innerWidth > 720 &&
          panel.getBoundingClientRect().right > innerWidth - 12
        )
          panel.classList.add("align-right");
      }
    }
    controllers.push({
      menu,
      close() {
        clearTimeout(timer);
        clearTimeout(childTimer);
        show(false);
      },
    });
    menu.onpointerenter = (e) => {
      if (e.pointerType === "touch") return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (panel.hidden) show(true, true);
      }, 100);
    };
    menu.onpointerleave = (e) => {
      if (e.pointerType === "touch") return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!menu.contains(document.activeElement)) show(false);
      }, 180);
    };
    menu.onfocusout = (e) => {
      if (!menu.contains(e.relatedTarget)) {
        clearTimeout(timer);
        show(false);
      }
    };
    trigger.onclick = () => {
      clearTimeout(timer);
      show(hoverOpen || panel.hidden);
    };
    for (const group of groups) {
      const button = group.querySelector(".platform-category"),
        child = group.querySelector(".platform-submenu");
      group.onpointerenter = (e) => {
        if (e.pointerType !== "touch") showGroup(group, true);
      };
      group.onpointerleave = (e) => {
        if (e.pointerType === "touch") return;
        clearTimeout(childTimer);
        childTimer = setTimeout(() => {
          if (!group.contains(document.activeElement) && !child.hidden)
            showGroup(null);
        }, 180);
      };
      button.onclick = () =>
        showGroup(hoverGroup === group || child.hidden ? group : null);
      button.onkeydown = (e) => {
        if (e.key === "ArrowRight") {
          e.preventDefault();
          showGroup(group);
          (
            child.querySelector('[aria-current="page"]') ||
            child.querySelector("a")
          ).focus();
        }
      };
    }
    menu.onkeydown = (e) => {
      const group = e.target.closest(".platform-group");
      if (
        e.key === "Escape" ||
        (e.key === "ArrowLeft" && e.target.closest(".platform-submenu"))
      ) {
        e.preventDefault();
        clearTimeout(timer);
        if (group && !group.querySelector(".platform-submenu").hidden) {
          showGroup(null);
          group.querySelector(".platform-category").focus();
        } else {
          show(false);
          trigger.focus();
        }
      }
      if (e.key === "ArrowDown" && e.target === trigger) {
        e.preventDefault();
        clearTimeout(timer);
        show(true);
        panel.querySelector("button,a").focus();
      }
    };
  }
  nav.addEventListener("click", (e) => {
    if (e.target.closest("[data-nav-route]"))
      controllers.forEach((c) => c.close());
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".platform-navigation"))
      controllers.forEach((c) => c.close());
  });
  window.syncPlatformNavigation = () => {
    updateChrome();
    const page = location.hash.slice(1).split("/")[0] || "chat";
    for (const menu of nav.querySelectorAll(".platform-navigation")) {
      const selected =
        menu.dataset.module === (page === "agentic" ? "scanner" : page);
      menu
        .querySelector(".platform-trigger")
        .classList.toggle("active", selected);
    }
    for (const a of nav.querySelectorAll("[data-nav-route]")) {
      if (a.getAttribute("href") === location.hash)
        a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    }
  };
  hydrateIcons(nav);
  syncPlatformNavigation();
})();
