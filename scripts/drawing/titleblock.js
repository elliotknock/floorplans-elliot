import { closeSidebar, startTool, stopCurrentTool, registerToolCleanup, setupColorPicker } from "./drawing-utils.js";

if (!window.activeTitleBlocks) window.activeTitleBlocks = [];

export function setupTitleBlockTool(fabricCanvas) {
  const addTitleBlockBtn = document.getElementById("titleblock-btn");
  let isTitleBlockMode = false;
  const config = {
    width: 950,
    height: 360,
    borderColor: "#000000",
    fontSize: 14,
    fontFamily: "Arial",
    cellPadding: 12,
  };

  const getActiveTitleBlocks = () => window.activeTitleBlocks || [];
  const addToActiveTitleBlocks = (block) => (window.activeTitleBlocks = window.activeTitleBlocks || []).push(block);
  const removeFromActiveTitleBlocks = (block) => window.activeTitleBlocks && (window.activeTitleBlocks = window.activeTitleBlocks.filter((b) => b !== block));
  const getValue = (id) => document.getElementById(id)?.value || "";

  const getClientDetails = () => {
    const logoImg = document.querySelector("#client-logo-preview img");
    return {
      date: getValue("client-date-input"),
      name: getValue("client-name-test-input"),
      address: getValue("address-input"),
      title: getValue("report-title-input"),
      logoSrc: logoImg?.src || null,
      revs: ["rev-one-input", "rev-two-input", "rev-three-input"].map(getValue),
    };
  };

  const createLogo = (group, logoSrc, left, top, width, height) => {
    fabric.Image.fromURL(
      logoSrc,
      (img) => {
        const availableW = width - 2 * config.cellPadding;
        const availableH = height - 2 * config.cellPadding;
        const scale = Math.min(availableW / img.width, availableH / img.height);
        const logoX = left + config.cellPadding + (availableW - img.width * scale) / 2;
        const logoY = top + config.cellPadding + (availableH - img.height * scale) / 2;

        img.set({
          left: logoX,
          top: logoY,
          scaleX: scale,
          scaleY: scale,
          selectable: true,
          isClientLogo: true,
        });
        img.containerBounds = {
          left: left,
          top: top,
          right: left + width,
          bottom: top + height,
        };
        group.add(img);
        fabricCanvas.requestRenderAll();
      },
      { crossOrigin: "anonymous" }
    );
  };

  const updateTitleBlock = (group, details) => {
    const objects = group.getObjects();
    const containerW = config.width / 3;
    const containerH = config.height * (2 / 3) - 20;

    const fieldMap = {
      isDateField: details.date,
      isClientName: details.name,
      isClientAddress: details.address,
      isReportTitle: details.title,
      isRev1: details.revs[0],
      isRev2: details.revs[1],
      isRev3: details.revs[2],
    };

    objects.forEach((obj) => {
      if (obj.type === "textbox" && !obj.isHeader) {
        if (!obj.splitByGrapheme) obj.set({ splitByGrapheme: true });
        const key = Object.keys(fieldMap).find((k) => obj[k]);
        if (key) obj.set({ text: fieldMap[key] });
      }
    });

    const placeholder = objects.find((o) => o.isClientLogo && o.type === "textbox");
    const existingLogo = objects.find((o) => o.isClientLogo && o.type === "image");

    const getLogoContainer = (obj) => {
      // If containerBounds exists, use them directly (they're already correct)
      // Otherwise fall back to object position
      const x = obj.containerBounds?.left ?? (obj.left - config.cellPadding);
      const y = obj.containerBounds?.top ?? (obj.top - config.cellPadding);
      return { x, y };
    };

    if (details.logoSrc) {
      const obj = placeholder || (existingLogo?._originalElement?.src !== details.logoSrc ? existingLogo : null);
      if (obj) {
        const { x, y } = getLogoContainer(obj);
        group.remove(obj);
        createLogo(group, details.logoSrc, x, y, containerW, containerH);
      }
    } else if (existingLogo) {
      const { x, y } = getLogoContainer(existingLogo);
      group.remove(existingLogo);
      group.add(
        new fabric.Textbox("", {
          left: x + config.cellPadding,
          top: y + config.cellPadding,
          width: containerW - 2 * config.cellPadding,
          height: containerH - 2 * config.cellPadding,
          fontSize: config.fontSize,
          fontFamily: config.fontFamily,
          isClientLogo: true,
        })
      );
    }
    fabricCanvas.requestRenderAll();
  };

  const updateAllTitleBlocks = () => {
    const details = getClientDetails();
    window.activeTitleBlocks = getActiveTitleBlocks().filter((block) => {
      const active = fabricCanvas.getObjects().includes(block);
      if (active) updateTitleBlock(block, details);
      return active;
    });
  };

  const createRect = (left, top, width, height, fill = "white") => new fabric.Rect({ left, top, width, height, fill, stroke: config.borderColor, strokeWidth: 1 });

  const createText = (text, left, top, width, options = {}) =>
    new fabric.Textbox(text, {
      left,
      top,
      width,
      fontSize: config.fontSize,
      fontFamily: config.fontFamily,
      splitByGrapheme: true,
      ...options,
    });

  const createTitleBlock = (left, top) => {
    const details = getClientDetails();
    const items = [];
    const colW = config.width / 3;
    const colH = config.height;
    const logoH = (colH * 2) / 3 - 20;

    const columns = [
      {
        x: 0,
        sections: [
          { header: "Client Logo", height: (colH * 2) / 3, content: "", isLogo: true },
          {
            header: "Completed Date",
            height: colH / 3,
            content: details.date,
            field: "isDateField",
          },
        ],
      },
      {
        x: colW,
        sections: [
          { header: "Client Name", height: colH / 3, content: details.name, field: "isClientName" },
          {
            header: "Client Address",
            height: colH / 3,
            content: details.address,
            field: "isClientAddress",
          },
          {
            header: "Report Title",
            height: colH / 3,
            content: details.title,
            field: "isReportTitle",
          },
        ],
      },
      {
        x: colW * 2,
        sections: [
          {
            header: "Rev 1",
            height: colH / 3,
            content: details.revs[0],
            field: "isRev1",
            editable: true,
          },
          {
            header: "Rev 2",
            height: colH / 3,
            content: details.revs[1],
            field: "isRev2",
            editable: true,
          },
          {
            header: "Rev 3",
            height: colH / 3,
            content: details.revs[2],
            field: "isRev3",
            editable: true,
          },
        ],
      },
    ];

    columns.forEach((col) => {
      let y = 0;
      col.sections.forEach((s) => {
        const headerH = 20;
        const contentH = s.height - headerH;
        items.push(createRect(col.x, y, colW, headerH, "#f0f0f0"));
        items.push(
          createText(s.header, col.x + config.cellPadding, y + 3, colW - 2 * config.cellPadding, {
            textAlign: "center",
            isHeader: true,
          })
        );
        items.push(createRect(col.x, y + headerH, colW, contentH));

        const textOpts = s.isLogo ? { isClientLogo: true } : { textAlign: "center", editable: !!s.editable, [s.field]: true };
        items.push(createText(s.content, col.x + config.cellPadding, y + headerH + config.cellPadding, colW - 2 * config.cellPadding, textOpts));
        y += s.height;
      });
    });

    const group = new fabric.Group(items, {
      left,
      top,
      selectable: true,
      hasControls: true,
      hasBorders: true,
      deviceType: "title-block",
      cursorColor: "#f8794b",
      borderColor: "#f8794b",
      borderScaleFactor: 2,
      cornerSize: 8,
      cornerColor: "#f8794b",
      cornerStrokeColor: "#000000",
      cornerStyle: "circle",
      transparentCorners: false,
    });
    group.id = `titleblock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const wasExecuting = window.undoSystem?.isExecutingCommand;
    if (window.undoSystem) window.undoSystem.isExecutingCommand = true;
    fabricCanvas.add(group);
    fabricCanvas.setActiveObject(group);
    addToActiveTitleBlocks(group);
    if (window.undoSystem) {
      window.undoSystem.isExecutingCommand = wasExecuting;
      window.undoSystem.addToStack(new window.UndoCommands.AddCommand(fabricCanvas, group, []));
    }
    fabricCanvas.requestRenderAll();
    stopCurrentTool();

    if (details.logoSrc) {
      setTimeout(() => {
        const placeholder = group.getObjects().find((obj) => obj.isClientLogo);
        if (placeholder) {
          group.remove(placeholder);
          createLogo(group, details.logoSrc, placeholder.left - config.cellPadding, placeholder.top - config.cellPadding, colW, logoH);
        }
      }, 100);
    }
  };

  fabricCanvas.on("object:moving", (e) => {
    const obj = e.target;
    if (obj.type === "image" && obj.isClientLogo && obj.containerBounds) {
      const bounds = obj.containerBounds;
      const rect = obj.getBoundingRect();

      if (rect.left < bounds.left) obj.set("left", obj.left + (bounds.left - rect.left));
      if (rect.left + rect.width > bounds.right) obj.set("left", obj.left - (rect.left + rect.width - bounds.right));
      if (rect.top < bounds.top) obj.set("top", obj.top + (bounds.top - rect.top));
      if (rect.top + rect.height > bounds.bottom) obj.set("top", obj.top - (rect.top + rect.height - bounds.bottom));
    }
  });

  const updateLogoPreview = (dataUrl) => {
    const preview = document.getElementById("client-logo-preview");
    if (preview) {
      preview.innerHTML = `<img src="${dataUrl}" alt="Client Logo" style="max-width: 100%; max-height: 100px;">`;
      try {
        localStorage.setItem("clientLogoDataUrl", dataUrl);
      } catch (_) {}
      setTimeout(updateAllTitleBlocks, 100);
    }
  };

  const setupListeners = () => {
    ["client-date-input", "client-name-test-input", "address-input", "report-title-input", "rev-one-input", "rev-two-input", "rev-three-input"].forEach((id) => {
      const input = document.getElementById(id);
      if (input) {
        input.addEventListener("input", updateAllTitleBlocks);
        input.addEventListener("change", updateAllTitleBlocks);
      }
    });

    const logoUpload = document.getElementById("client-logo-upload");
    if (logoUpload) {
      logoUpload.addEventListener("change", (e) => {
        if (e.target.files?.[0]) {
          const reader = new FileReader();
          reader.onload = (event) => updateLogoPreview(event.target.result);
          reader.readAsDataURL(e.target.files[0]);
        }
      });
    }

    const logoPreview = document.getElementById("client-logo-preview");
    if (logoPreview) {
      new MutationObserver(() => {
        setTimeout(updateAllTitleBlocks, 100);
        try {
          const img = logoPreview.querySelector("img");
          if (img?.src) localStorage.setItem("clientLogoDataUrl", img.src);
          else localStorage.removeItem("clientLogoDataUrl");
        } catch (_) {}
      }).observe(logoPreview, { childList: true, subtree: true });

      try {
        const saved = localStorage.getItem("clientLogoDataUrl");
        if (saved && !logoPreview.querySelector("img")) updateLogoPreview(saved);
      } catch (_) {}
    }
  };

  const onMouseDown = (e) => {
    const p = fabricCanvas.getPointer(e.e);
    createTitleBlock(p.x - config.width / 2, p.y - config.height / 2);
  };

  const startTitleBlockMode = () => {
    if (isTitleBlockMode) return;
    isTitleBlockMode = true;
    closeSidebar();
    registerToolCleanup(() => (isTitleBlockMode = false));
    startTool(fabricCanvas, "titleblock", onMouseDown);
  };

  if (addTitleBlockBtn) {
    const newBtn = addTitleBlockBtn.cloneNode(true);
    addTitleBlockBtn.parentNode.replaceChild(newBtn, addTitleBlockBtn);
    newBtn.addEventListener("click", (e) => {
      e.preventDefault();
      startTitleBlockMode();
    });
  }

  const removalHandler = (e) => e.target?.deviceType === "title-block" && removeFromActiveTitleBlocks(e.target);
  fabricCanvas.off("object:removed", removalHandler);
  fabricCanvas.on("object:removed", removalHandler);

  setupColorPicker(fabricCanvas);
  setupListeners();

  const cleanup = () => {
    fabricCanvas.off("object:moving");
    fabricCanvas.off("object:removed", removalHandler);
  };

  window.titleBlockCleanup = cleanup;
  window.updateAllTitleBlocks = updateAllTitleBlocks;
}
