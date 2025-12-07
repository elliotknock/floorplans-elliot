// Sets up screenshot cropping with Cropper.js
export function initCanvasCrop(fabricCanvas, subSidebar) {
  const elements = {
    modal: document.getElementById("cropScreenshotModal"),
    preview: document.getElementById("crop-screenshot-preview"),
    confirmBtn: document.getElementById("crop-confirm-screenshot-btn"),
    previews: document.getElementById("screenshot-previews"),
    template: document.getElementById("screenshot-preview-template")
  };
  
  let cropperInstance = null;
  let currentCanvasDataURL = null;
  let cropModalInstance = null;
  const screenshots = [];

  // Set up Bootstrap modal
  if (elements.modal && typeof bootstrap !== "undefined") {
    cropModalInstance = new bootstrap.Modal(elements.modal);
  }

  // Creates the Cropper.js instance
  function initCropper() {
    if (cropperInstance) cropperInstance.destroy();
    setTimeout(() => {
      cropperInstance = new Cropper(elements.preview, {
        aspectRatio: NaN,
        viewMode: 1,
        autoCropArea: 0.8,
        responsive: true,
        background: true,
        movable: true,
        zoomable: true,
        scalable: true,
        cropBoxMovable: true,
        cropBoxResizable: true,
        wheelZoomRatio: 0.1,
        checkOrientation: false,
        ready() { cropperInstance.resize(); }
      });
    }, 300);
  }

  // Cleans up cropper and preview
  function resetCropper() {
    if (cropperInstance) { cropperInstance.destroy(); cropperInstance = null; }
    if (elements.preview) {
      elements.preview.src = "";
      elements.preview.removeAttribute("src");
      elements.preview.onload = elements.preview.onerror = null;
    }
  }

  // Shows the crop modal
  function showModal() {
    if (subSidebar) subSidebar.classList.add("hidden");
    resetCropper();

    if (elements.preview) {
      elements.preview.onload = () => {
        elements.preview.onerror = null;
        initCropper();
        elements.preview.onload = null;
      };
      elements.preview.onerror = () => {
        if (!currentCanvasDataURL) console.warn("Screenshot load aborted");
        else alert("Failed to load screenshot. Please try again.");
        elements.preview.onload = elements.preview.onerror = null;
      };
      elements.preview.src = currentCanvasDataURL;
    }
    if (cropModalInstance) cropModalInstance.show();
  }

  // Hides the crop modal
  function closeModal() {
    if (cropModalInstance) cropModalInstance.hide();
    resetCropper();
    if (subSidebar) subSidebar.classList.remove("hidden");
  }

  // Creates a preview item for a screenshot
  function createPreview(screenshot) {
    if (!elements.previews) return;

    let previewItem;

    // Try template first
    if (elements.template?.content) {
      try {
        const container = elements.template.content.cloneNode(true);
        previewItem = container.querySelector(".screenshot-preview-item");
        if (previewItem) {
          const img = previewItem.querySelector(".screenshot-image");
          const checkbox = previewItem.querySelector(".screenshot-checkbox");
          const label = previewItem.querySelector(".screenshot-checkbox-label");

          if (img) { img.src = screenshot.dataURL; img.alt = `Screenshot ${screenshots.length}`; }
          if (checkbox) checkbox.id = `screenshot-${screenshot.id}`;
          if (label && checkbox) label.setAttribute("for", checkbox.id);

          elements.previews.appendChild(container);
        }
      } catch (e) {
        previewItem = createManualPreview(screenshot);
      }
    } else {
      previewItem = createManualPreview(screenshot);
    }

    // Add event listeners
    if (previewItem) {
      const checkbox = previewItem.querySelector(".screenshot-checkbox");
      const deleteBtn = previewItem.querySelector(".screenshot-delete-btn");

      if (checkbox) checkbox.addEventListener("change", () => screenshot.includeInPrint = checkbox.checked);
      if (deleteBtn) deleteBtn.addEventListener("click", () => {
        const index = screenshots.indexOf(screenshot);
        if (index > -1) {
          screenshots.splice(index, 1);
          previewItem.remove();
          setTimeout(() => window.updateScreenshotStatus?.(), 100);
        }
      });
      setTimeout(() => window.updateScreenshotStatus?.(), 100);
    }
  }

  // Creates preview manually when no template exists
  function createManualPreview(screenshot) {
    const previewItem = document.createElement("div");
    previewItem.className = "screenshot-preview-item";

    // Create image
    const img = document.createElement("img");
    img.className = "screenshot-image";
    img.src = screenshot.dataURL;
    img.alt = `Screenshot ${screenshots.length}`;
    img.style.cssText = "width: 100%; height: auto; margin-bottom: 10px;";

    // Create controls
    const controls = document.createElement("div");
    controls.className = "screenshot-controls";
    controls.style.cssText = "display: flex; flex-direction: column; gap: 5px;";

    // Checkbox with label
    const checkboxLabel = document.createElement("label");
    checkboxLabel.className = "screenshot-checkbox-label";
    checkboxLabel.style.cssText = "display: flex; align-items: center; gap: 5px;";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "screenshot-checkbox";
    checkbox.id = `screenshot-${screenshot.id}`;

    const checkboxText = document.createElement("span");
    checkboxText.textContent = "Include in print";

    checkboxLabel.appendChild(checkbox);
    checkboxLabel.appendChild(checkboxText);

    // Title textarea
    const titleTextarea = document.createElement("textarea");
    titleTextarea.className = "screenshot-title";
    titleTextarea.placeholder = "Title or Description";
    titleTextarea.maxLength = 74;
    titleTextarea.style.cssText = "width: 100%; min-height: 40px; resize: vertical;";

    // Delete button
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "screenshot-delete-btn";
    deleteBtn.textContent = "Delete";
    deleteBtn.style.cssText = "padding: 5px 10px; background: #dc3545; color: white; border: none; border-radius: 3px; cursor: pointer;";

    // Assemble
    controls.appendChild(checkboxLabel);
    controls.appendChild(titleTextarea);
    controls.appendChild(deleteBtn);
    previewItem.appendChild(img);
    previewItem.appendChild(controls);
    elements.previews.appendChild(previewItem);

    return previewItem;
  }

  // Handles the crop action
  function handleCrop(type) {
    const croppedCanvas = cropperInstance?.getCroppedCanvas({
      width: 1200,
      height: "auto",
      minWidth: 800,
      maxWidth: 2400,
      fillColor: "#ffffff",
      imageSmoothingEnabled: true,
      imageSmoothingQuality: "high",
    });

    if (!croppedCanvas) return;

    const croppedDataURL = croppedCanvas.toDataURL("image/png", 1.0);

    if (type === "download") {
      // Download the cropped image
      const link = document.createElement("a");
      link.href = croppedDataURL;
      link.download = "floorplan.png";
      link.click();
    } else {
      // Save as screenshot preview
      screenshots.push({
        dataURL: croppedDataURL,
        includeInPrint: false,
        id: Date.now() + Math.random(),
      });
      createPreview(screenshots[screenshots.length - 1]);
    }
    closeModal();
  }

  // Set up event listeners
  elements.modal?.querySelector(".btn-close")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeModal();
  });

  if (elements.modal) {
    elements.modal.addEventListener("hidden.bs.modal", () => {
      resetCropper();
      if (subSidebar) subSidebar.classList.remove("hidden");
    });
    elements.modal.addEventListener("shown.bs.modal", () => {
      if (cropperInstance) setTimeout(() => cropperInstance.resize(), 100);
    });
    elements.modal.addEventListener("click", (e) => {
      if (e.target === elements.modal) closeModal();
    });
  }

  // Return public API
  return {
    startCropForDownload: () => {
      document.getElementById("select-background-popup")?.style.setProperty("display", "none");
      fabricCanvas.renderAll();
      currentCanvasDataURL = fabricCanvas.toDataURL({ format: "png", multiplier: 3, quality: 1.0 });
      showModal();
      if (elements.confirmBtn) elements.confirmBtn.onclick = () => handleCrop("download");
    },

    startCropForScreenshot: () => {
      document.getElementById("select-background-popup")?.style.setProperty("display", "none");
      fabricCanvas.renderAll();
      currentCanvasDataURL = fabricCanvas.toDataURL({ format: "png", multiplier: 3, quality: 1.0 });
      showModal();
      if (elements.confirmBtn) elements.confirmBtn.onclick = () => handleCrop("screenshot");
    },

    cancelCrop: closeModal,
    resetCrop: () => cropperInstance?.reset(),
    getScreenshots: () => screenshots,
    clearScreenshots: () => {
      screenshots.length = 0;
      elements.previews && (elements.previews.innerHTML = "");
    }
  };
}

