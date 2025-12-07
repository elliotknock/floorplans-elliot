// Custom icons management system
import { addCameraCoverage } from "./camera/camera-core.js";

const STORAGE_KEY = "customIconsV1";

// Loads custom icons from local storage
const loadIcons = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed
          .filter((x) => x?.id && x?.dataUrl)
          .map((icon) => ({
            ...icon,
            sections: icon.sections || ["custom"],
          }))
      : [];
  } catch (e) {
    console.error("Failed to load custom icons:", e);
    return [];
  }
};

// Saves custom icons to local storage
const saveIcons = (list) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (e) {
    console.error("Failed to save custom icons:", e);
  }
};

// Generates unique ID for icons
const uid = () => "ci_" + Math.random().toString(36).slice(2) + Date.now().toString(36);

// Converts file to data URL
const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

// Creates device item element for icon list
const createDeviceItem = (icon, section = "custom") => {
  const wrapper = document.createElement("div");
  wrapper.className = "device-wrapper";

  const item = document.createElement("div");
  item.className = "device-item";
  item.setAttribute("draggable", "true");
  item.dataset.device = icon.id;
  item.dataset.isCamera = icon.isCamera ? "1" : "0";
  item.dataset.name = icon.name || "Custom Icon";
  item.dataset.dataUrl = icon.dataUrl;
  item.title = `${icon.name || "Custom Icon"}${icon.isCamera ? " (Camera)" : ""}`;

  const iconBox = document.createElement("div");
  iconBox.className = "device-icon";
  const img = document.createElement("img");
  img.src = icon.dataUrl;
  img.alt = icon.name || "Custom Icon";
  img.style.maxWidth = "100%";
  iconBox.appendChild(img);
  item.appendChild(iconBox);

  // Delete button
  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "device-delete-btn";
  delBtn.innerHTML = "&times;";
  delBtn.title = "Delete";
  delBtn.dataset.section = section;
  delBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    const current = loadIcons();
    const updated = current
      .map((ic) => {
        if (ic.id === icon.id) {
          const newSections = ic.sections.filter((s) => s !== section);
          return newSections.length === 0 ? null : { ...ic, sections: newSections };
        }
        return ic;
      })
      .filter((ic) => ic !== null);
    saveIcons(updated);
    renderAllSections();
  });
  item.appendChild(delBtn);

  const label = document.createElement("div");
  label.className = "device-label";
  label.textContent = icon.name || "Custom Icon";
  wrapper.appendChild(item);
  wrapper.appendChild(label);
  return wrapper;
};

// Renders icons in rows of 3
const renderIconsInRows = (icons, containerId, className = "device-row", section = "custom") => {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Clear existing custom rows
  const existingRows = container.querySelectorAll(`.${className}`);
  existingRows.forEach((row) => row.remove());

  if (!icons.length) {
    // Show empty message for custom section only
    if (section === "custom") {
      const empty = document.createElement("div");
      empty.className = "text-muted p-2";
      empty.textContent = "No custom icons yet";
      container.appendChild(empty);
    }
    return;
  }

  let rowEl = null;
  icons.forEach((icon, idx) => {
    if (idx % 3 === 0) {
      rowEl = document.createElement("div");
      rowEl.className = className;
      container.appendChild(rowEl);
    }
    rowEl.appendChild(createDeviceItem(icon, section));
  });
};

// Renders custom icons list
const renderList = () => {
  const icons = loadIcons();
  const customIcons = icons.filter((icon) => icon.sections?.includes("custom"));
  renderIconsInRows(customIcons, "custom-icons-list");
  setupDragHandlers();
};

// Renders custom icons in device sections
const renderCustomIconsInSections = () => {
  const icons = loadIcons();
  const sections = {
    cctv: document.getElementById("cctv-collapse"),
    access: document.getElementById("access-collapse"),
    intruder: document.getElementById("intruder-collapse"),
    fire: document.getElementById("fire-collapse"),
  };

  // Clear existing custom icons from sections
  Object.values(sections).forEach((container) => {
    if (container) {
      const customRows = container.querySelectorAll(".custom-device-row");
      customRows.forEach((row) => row.remove());
    }
  });

  // Group icons by section
  const sectionIcons = {};
  icons.forEach((icon) => {
    icon.sections?.forEach((sec) => {
      if (sec !== "custom") {
        if (!sectionIcons[sec]) sectionIcons[sec] = [];
        sectionIcons[sec].push(icon);
      }
    });
  });

  // Render in each section
  Object.entries(sections).forEach(([sec, container]) => {
    if (container && sectionIcons[sec]) {
      renderIconsInRows(sectionIcons[sec], container.id, "device-row custom-device-row", sec);
    }
  });
  setupDragHandlers();
};

// Renders all sections
const renderAllSections = () => {
  renderList();
  renderCustomIconsInSections();
};

// Sets up modal buttons for adding custom icons
const setupButtons = () => {
  const addBtn = document.getElementById("add-custom-icon-btn");
  const saveBtn = document.getElementById("save-custom-icon-btn");

  if (addBtn) {
    addBtn.addEventListener("click", () => {
      const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById("custom-icon-modal"));
      // Reset form
      const inputs = ["custom-icon-file", "custom-icon-name", "custom-icon-is-camera", "custom-icon-cctv", "custom-icon-access", "custom-icon-intruder", "custom-icon-fire"];
      inputs.forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
          if (el.type === "checkbox") el.checked = id === "custom-icon-custom";
          else el.value = "";
        }
      });
      modal.show();
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      const file = document.getElementById("custom-icon-file");
      const name = document.getElementById("custom-icon-name");
      const isCam = document.getElementById("custom-icon-is-camera");

      if (!file?.files?.[0]) {
        alert("Please choose an image file");
        return;
      }

      const f = file.files[0];
      if (!/^image\/(png|jpeg)$/.test(f.type)) {
        alert("Only PNG or JPG images are supported");
        return;
      }

      const dataUrl = await readFileAsDataUrl(f);
      const sections = [];
      ["custom-icon-cctv", "custom-icon-access", "custom-icon-intruder", "custom-icon-fire", "custom-icon-custom"].forEach((id) => {
        const el = document.getElementById(id);
        if (el?.checked) sections.push(id.replace("custom-icon-", ""));
      });

      const entry = {
        id: uid(),
        name: name?.value.trim() || f.name.replace(/\.[^.]+$/, ""),
        isCamera: !!isCam?.checked,
        sections,
        dataUrl,
        createdAt: Date.now(),
      };

      const icons = loadIcons();
      icons.push(entry);
      saveIcons(icons);
      renderAllSections();

      const modalEl = document.getElementById("custom-icon-modal");
      bootstrap.Modal.getOrCreateInstance(modalEl).hide();
    });
  }
};

// Sets up drag and drop handlers for icons
const setupDragHandlers = () => {
  const items = document.querySelectorAll("#custom-icons-list .device-item, .custom-device-row .device-item");
  items.forEach((item) => {
    item.addEventListener("dragstart", (e) => {
      const payload = {
        type: "custom-icon",
        dataUrl: item.dataset.dataUrl,
        isCamera: item.dataset.isCamera === "1",
        name: item.dataset.name || "Custom Icon",
      };

      try {
        e.dataTransfer.setData("application/json", JSON.stringify(payload));
      } catch (_) {}
      e.dataTransfer.setData("text/plain", item.dataset.dataUrl);
      e.dataTransfer.effectAllowed = "copy";
      item.classList.add("dragging");
    });

    item.addEventListener("dragend", () => item.classList.remove("dragging"));
  });
};

// Patches drop handler to support custom payloads
const patchDropHandler = () => {
  window.__getCustomDropPayload = function (dataTransfer) {
    try {
      const json = dataTransfer.getData("application/json");
      if (!json) return null;
      const parsed = JSON.parse(json);
      if (parsed?.type === "custom-icon" && parsed.dataUrl) return parsed;
    } catch (e) {}
    return null;
  };
};

// Initializes the custom icons system
const init = () => {
  renderAllSections();
  setupButtons();
  patchDropHandler();
};

document.addEventListener("DOMContentLoaded", init);
