import { closeSidebar, startTool, stopCurrentTool, setupDeletion, setupColorPicker, setupTextColorPicker, setupBackgroundColorPicker, applyStandardStyling } from "./drawing-utils.js";

// Sets up text drawing tools
export function setupTextTools(fabricCanvas) {
  const textBtn = document.getElementById("add-text-btn");

  setupColorPicker(fabricCanvas);
  setupTextColorPicker(fabricCanvas);
  setupBackgroundColorPicker(fabricCanvas);
  setupDeletion(fabricCanvas, (obj) => (obj.type === "i-text" || obj.type === "textbox") && !obj.isEditing);

  // Sets up text size dropdown
  setupTextSizeDropdown(fabricCanvas);
  
  // Sets up bold toggle
  setupBoldToggle(fabricCanvas);
  
  // Sets up italic toggle
  setupItalicToggle(fabricCanvas);

  // Activates text tool
  textBtn.addEventListener("click", () => {
    closeSidebar();
    startTool(fabricCanvas, "text", handleTextClick);
  });

  // Places text object on canvas
  function handleTextClick(e) {
    e.e.preventDefault();
    e.e.stopPropagation();

    const pointer = fabricCanvas.getPointer(e.e);
    const text = new fabric.IText("Enter Text", {
      left: pointer.x,
      top: pointer.y,
      fontSize: 20,
      fill: "#000000",
      fontFamily: "Poppins, sans-serif",
      originX: "center",
      originY: "center",
      cursorColor: "#f8794b",
    });

    applyStandardStyling(text);
    fabricCanvas.add(text);
    fabricCanvas.setActiveObject(text);
    stopCurrentTool();
  }
}

// Sets up text size dropdown
function setupTextSizeDropdown(fabricCanvas) {
  const dropdown = document.getElementById("text-size-dropdown");
  
  dropdown.addEventListener("change", () => {
    const fontSize = parseInt(dropdown.value);
    const activeObject = fabricCanvas.getActiveObject();
    
    if (activeObject) {
      if (activeObject.type === "i-text" || activeObject.type === "textbox" || activeObject.type === "text") {
        activeObject.set("fontSize", fontSize);
        fabricCanvas.renderAll();
      }
      else if (activeObject.type === "group" && activeObject._objects) {
        activeObject._objects.forEach((obj) => {
          if (obj.type === "i-text" || obj.type === "textbox" || obj.type === "text") {
            obj.set("fontSize", fontSize);
          }
        });
        activeObject.dirty = true;
        activeObject.setCoords();
        fabricCanvas.renderAll();
      }
    }
  });
  
  // Updates dropdown when selection changes
  fabricCanvas.on("selection:created", updateDropdownValue);
  fabricCanvas.on("selection:updated", updateDropdownValue);
  fabricCanvas.on("selection:cleared", () => {
    dropdown.value = "";
  });
  
  function updateDropdownValue() {
    const activeObject = fabricCanvas.getActiveObject();
    if (activeObject) {
      let textSize = null;
      
      if (activeObject.type === "i-text" || activeObject.type === "textbox" || activeObject.type === "text") {
        textSize = activeObject.fontSize;
      } else if (activeObject.type === "group" && activeObject._objects) {
        const textObj = activeObject._objects.find((obj) => obj.type === "i-text" || obj.type === "textbox" || obj.type === "text");
        if (textObj) textSize = textObj.fontSize;
      }
      
      if (textSize && (textSize === 14 || textSize === 18 || textSize === 24 || textSize === 32)) {
        dropdown.value = textSize;
      } else {
        dropdown.value = "";
      }
    }
  }
}

// Sets up bold toggle
function setupBoldToggle(fabricCanvas) {
  const boldBtn = document.getElementById("bold-toggle-btn");
  
  boldBtn.addEventListener("click", () => {
    const activeObject = fabricCanvas.getActiveObject();
    
    if (activeObject) {
      let isBold = false;
      
      if (activeObject.type === "i-text" || activeObject.type === "textbox" || activeObject.type === "text") {
        isBold = activeObject.fontWeight === "bold";
        activeObject.set("fontWeight", isBold ? "normal" : "bold");
        fabricCanvas.renderAll();
        boldBtn.style.background = isBold ? "white" : "#f8794b";
      }
      else if (activeObject.type === "group" && activeObject._objects) {
        const textObj = activeObject._objects.find((obj) => obj.type === "i-text" || obj.type === "textbox" || obj.type === "text");
        if (textObj) {
          isBold = textObj.fontWeight === "bold";
          activeObject._objects.forEach((obj) => {
            if (obj.type === "i-text" || obj.type === "textbox" || obj.type === "text") {
              obj.set("fontWeight", isBold ? "normal" : "bold");
            }
          });
          activeObject.dirty = true;
          activeObject.setCoords();
          fabricCanvas.renderAll();
          boldBtn.style.background = isBold ? "white" : "#f8794b";
        }
      }
    }
  });
  
  // Updates button state when selection changes
  fabricCanvas.on("selection:created", updateBoldButton);
  fabricCanvas.on("selection:updated", updateBoldButton);
  fabricCanvas.on("selection:cleared", () => {
    boldBtn.style.background = "white";
  });
  
  function updateBoldButton() {
    const activeObject = fabricCanvas.getActiveObject();
    if (activeObject) {
      let isBold = false;
      
      if (activeObject.type === "i-text" || activeObject.type === "textbox" || activeObject.type === "text") {
        isBold = activeObject.fontWeight === "bold";
      } else if (activeObject.type === "group" && activeObject._objects) {
        const textObj = activeObject._objects.find((obj) => obj.type === "i-text" || obj.type === "textbox" || obj.type === "text");
        if (textObj) isBold = textObj.fontWeight === "bold";
      }
      
      boldBtn.style.background = isBold ? "#f8794b" : "white";
    }
  }
}

// Sets up italic toggle
function setupItalicToggle(fabricCanvas) {
  const italicBtn = document.getElementById("italic-toggle-btn");
  
  italicBtn.addEventListener("click", () => {
    const activeObject = fabricCanvas.getActiveObject();
    
    if (activeObject) {
      let isItalic = false;
      
      if (activeObject.type === "i-text" || activeObject.type === "textbox" || activeObject.type === "text") {
        isItalic = activeObject.fontStyle === "italic";
        activeObject.set("fontStyle", isItalic ? "normal" : "italic");
        fabricCanvas.renderAll();
        italicBtn.style.background = isItalic ? "white" : "#f8794b";
      }
      else if (activeObject.type === "group" && activeObject._objects) {
        const textObj = activeObject._objects.find((obj) => obj.type === "i-text" || obj.type === "textbox" || obj.type === "text");
        if (textObj) {
          isItalic = textObj.fontStyle === "italic";
          activeObject._objects.forEach((obj) => {
            if (obj.type === "i-text" || obj.type === "textbox" || obj.type === "text") {
              obj.set("fontStyle", isItalic ? "normal" : "italic");
            }
          });
          activeObject.dirty = true;
          activeObject.setCoords();
          fabricCanvas.renderAll();
          italicBtn.style.background = isItalic ? "white" : "#f8794b";
        }
      }
    }
  });
  
  // Updates button state when selection changes
  fabricCanvas.on("selection:created", updateItalicButton);
  fabricCanvas.on("selection:updated", updateItalicButton);
  fabricCanvas.on("selection:cleared", () => {
    italicBtn.style.background = "white";
  });
  
  function updateItalicButton() {
    const activeObject = fabricCanvas.getActiveObject();
    if (activeObject) {
      let isItalic = false;
      
      if (activeObject.type === "i-text" || activeObject.type === "textbox" || activeObject.type === "text") {
        isItalic = activeObject.fontStyle === "italic";
      } else if (activeObject.type === "group" && activeObject._objects) {
        const textObj = activeObject._objects.find((obj) => obj.type === "i-text" || obj.type === "textbox" || obj.type === "text");
        if (textObj) isItalic = textObj.fontStyle === "italic";
      }
      
      italicBtn.style.background = isItalic ? "#f8794b" : "white";
    }
  }
}
