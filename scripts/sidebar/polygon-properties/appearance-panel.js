import { updateSliderTrack, createSliderInputSync, setupColorControls, preventEventPropagation, createToggleHandler, setMultipleObjectProperties, updateWarningText, getHexFromFill } from "../sidebar-utils.js";
import { updatePolygonText, updatePolygonColor } from "../sidebar-utils.js";
import { calculateArea } from "../sidebar-utils.js";

// Sets up the appearance panel for zones and rooms with colors, text size, and toggles
export function initAppearancePanel(detailsPanelInstance) {
  // Zone controls
  const zoneTextSizeInput = document.getElementById("zone-text-size-input");
  const zoneTextSizeSlider = document.getElementById("zone-text-size-slider");
  const zoneColorPicker = document.getElementById("zone-color-picker");
  const zoneColorIcons = document.querySelectorAll(".change-zone-colour .colour-icon");
  const zoneTextColorPicker = document.getElementById("zone-text-color-picker");
  const zoneTextColorIcons = document.querySelectorAll(".zone-text-colour .colour-icon");

  const zoneNameToggle = document.getElementById("zone-name-toggle");
  const zoneAreaToggle = document.getElementById("zone-area-toggle");
  const zoneVolumeToggle = document.getElementById("zone-volume-toggle");
  const zoneNotesToggle = document.getElementById("zone-notes-toggle");

  // Room controls
  const roomTextSizeInput = document.getElementById("room-text-size-input");
  const roomTextSizeSlider = document.getElementById("room-text-size-slider");
  const roomColorPicker = document.getElementById("room-color-picker");
  const roomColorIcons = document.querySelectorAll(".change-room-colour .colour-icon");
  const roomTextColorPicker = document.getElementById("room-text-color-picker");
  const roomTextColorIcons = document.querySelectorAll(".room-text-colour .colour-icon");

  const roomNameToggle = document.getElementById("room-name-toggle");
  const roomAreaToggle = document.getElementById("room-area-toggle");
  const roomVolumeToggle = document.getElementById("room-volume-toggle");
  const roomNotesToggle = document.getElementById("room-notes-toggle");

  // Updates zone text display when toggles change
  function updateZoneText() {
    const { currentPolygon, currentTextObject } = detailsPanelInstance.getCurrentZone();
    if (!currentPolygon || !currentTextObject || !currentPolygon.canvas) return;
    const canvas = currentPolygon.canvas;
    const area = calculateArea(currentPolygon.points, canvas);
    const height = currentTextObject.displayHeight || currentPolygon.height || 2.4;
    const volume = area * height;
    const name = currentPolygon.zoneName || currentTextObject.text?.split("\n")[0] || "Zone";
    const notes = currentPolygon.zoneNotes || "";
    updatePolygonText(currentPolygon, currentTextObject, canvas, { name: zoneNameToggle, area: zoneAreaToggle, volume: zoneVolumeToggle, notes: zoneNotesToggle }, name, notes, height, true);
  }

  // Updates zone fill and border color
  function updateZoneColor(color) {
    const { currentPolygon, currentTextObject } = detailsPanelInstance.getCurrentZone();
    if (!currentPolygon || !currentPolygon.canvas) return;
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    const fillColor = `rgba(${r}, ${g}, ${b}, 0.2)`;
    const strokeColor = `rgba(${r}, ${g}, ${b}, 1)`;
    setMultipleObjectProperties(currentPolygon, { fill: fillColor, stroke: strokeColor }, currentPolygon.canvas);
    setMultipleObjectProperties(currentTextObject, { fill: strokeColor, cursorColor: strokeColor });
  }

  // Updates zone text color
  function updateZoneTextColor(color) {
    const { currentPolygon, currentTextObject } = detailsPanelInstance.getCurrentZone();
    if (currentPolygon && currentTextObject && currentPolygon.canvas) {
      setMultipleObjectProperties(currentTextObject, { fill: color }, currentPolygon.canvas);
    }
  }

  // Updates room text display when toggles change
  function updateRoomText() {
    const { currentRoom, currentRoomPolygon, currentRoomText } = detailsPanelInstance.getCurrentRoom();
    if (!currentRoomPolygon || !currentRoomText || !currentRoomPolygon.canvas) return;
    const canvas = currentRoomPolygon.canvas;
    const name = currentRoomPolygon.roomName;
    const notes = currentRoomPolygon.roomNotes || "";
    const area = calculateArea(currentRoomPolygon.points, canvas);
    const height = currentRoomText.displayHeight || currentRoomPolygon.height || 2.4;
    const volume = area * height;
    updatePolygonText(currentRoomPolygon, currentRoomText, canvas, { name: roomNameToggle, area: roomAreaToggle, volume: roomVolumeToggle, notes: roomNotesToggle }, name, notes, height, false);

    currentRoomPolygon.area = area;
    currentRoomPolygon.volume = volume;
    if (currentRoom) {
      currentRoom.area = area;
      currentRoom.volume = volume;
    }
  }

  // Updates room border color
  function updateRoomColor(color) {
    const { currentRoom, currentRoomPolygon, currentRoomText } = detailsPanelInstance.getCurrentRoom();
    if (!currentRoomPolygon || !currentRoomText || !currentRoom) return;
    updatePolygonColor(currentRoomPolygon, currentRoomText, color, false);
    currentRoom.roomColor = color;
  }

  // Updates room text color
  function updateRoomTextColor(color) {
    const { currentRoomText } = detailsPanelInstance.getCurrentRoom();
    if (currentRoomText) {
      setMultipleObjectProperties(currentRoomText, { fill: color, cursorColor: color });
    }
  }

  window.updateZoneText = updateZoneText;
  window.updateRoomText = updateRoomText;

  // Sets up zone text size slider
  createSliderInputSync(
    zoneTextSizeSlider,
    zoneTextSizeInput,
    (size) => {
      const { currentPolygon, currentTextObject } = detailsPanelInstance.getCurrentZone();
      if (currentPolygon && currentTextObject && currentPolygon.canvas) {
        setMultipleObjectProperties(currentTextObject, { fontSize: size }, currentPolygon.canvas);
      }
    },
    { min: 1, max: 100, step: 1, format: (value) => value + "px" }
  );

  // Zone toggles
  createToggleHandler(zoneNameToggle, () => updateZoneText());
  createToggleHandler(zoneAreaToggle, () => updateZoneText());
  createToggleHandler(zoneVolumeToggle, () => updateZoneText());
  createToggleHandler(zoneNotesToggle, () => updateZoneText());

  setupColorControls(zoneColorPicker, zoneColorIcons, updateZoneColor);
  setupColorControls(zoneTextColorPicker, zoneTextColorIcons, updateZoneTextColor);

  [zoneTextSizeInput, zoneTextSizeSlider].forEach((el) => {
    if (el) preventEventPropagation(el, ["click"]);
  });

  // Room sliders
  createSliderInputSync(
    roomTextSizeSlider,
    roomTextSizeInput,
    (size) => {
      const { currentRoomPolygon, currentRoomText } = detailsPanelInstance.getCurrentRoom();
      if (currentRoomPolygon && currentRoomText && currentRoomPolygon.canvas) {
        setMultipleObjectProperties(currentRoomText, { fontSize: size }, currentRoomPolygon.canvas);
      }
    },
    { min: 1, max: 100, step: 1, format: (value) => value + "px" }
  );

  // Sets up zone toggles for showing/hiding name, area, volume, notes
  createToggleHandler(zoneNameToggle, () => updateZoneText());
  createToggleHandler(zoneAreaToggle, () => updateZoneText());
  createToggleHandler(zoneVolumeToggle, () => updateZoneText());
  createToggleHandler(zoneNotesToggle, () => updateZoneText());

  setupColorControls(zoneColorPicker, zoneColorIcons, updateZoneColor);
  setupColorControls(zoneTextColorPicker, zoneTextColorIcons, updateZoneTextColor);

  [zoneTextSizeInput, zoneTextSizeSlider].forEach((el) => {
    if (el) preventEventPropagation(el, ["click"]);
  });

  // Sets up room text size slider
  createSliderInputSync(
    roomTextSizeSlider,
    roomTextSizeInput,
    (size) => {
      const { currentRoomPolygon, currentRoomText } = detailsPanelInstance.getCurrentRoom();
      if (currentRoomPolygon && currentRoomText && currentRoomPolygon.canvas) {
        setMultipleObjectProperties(currentRoomText, { fontSize: size }, currentRoomPolygon.canvas);
      }
    },
    { min: 10, max: 30, step: 1, format: (value) => value + "px" }
  );

  // Sets up room toggles for showing/hiding name, area, volume, notes
  createToggleHandler(roomNameToggle, () => updateRoomText());
  createToggleHandler(roomAreaToggle, () => updateRoomText());
  createToggleHandler(roomVolumeToggle, () => updateRoomText());
  createToggleHandler(roomNotesToggle, () => updateRoomText());

  setupColorControls(roomColorPicker, roomColorIcons, updateRoomColor);
  setupColorControls(roomTextColorPicker, roomTextColorIcons, updateRoomTextColor);

  [roomTextSizeInput, roomTextSizeSlider].forEach((el) => {
    if (el) preventEventPropagation(el, ["click"]);
  });

  return {
    // Updates all appearance controls to match selected zone or room
    updateAppearancePanel: (type, polygon, textObject, zoneOrRoom) => {
      if (type === "zone") {
        if (zoneTextSizeInput && zoneTextSizeSlider && textObject) {
          let textSizeValue = textObject.fontSize || 15;
          if (isNaN(textSizeValue) || textSizeValue < 1 || textSizeValue > 100) textSizeValue = 15;
          zoneTextSizeInput.textContent = textSizeValue + "px";
          zoneTextSizeSlider.value = textSizeValue;
          textObject.fontSize = textSizeValue;
          updateSliderTrack(zoneTextSizeSlider, textSizeValue, zoneTextSizeSlider.min || 1, zoneTextSizeSlider.max || 100);
        }
        if (zoneColorPicker && polygon.fill) zoneColorPicker.value = getHexFromFill(polygon.fill);
        if (zoneTextColorPicker && textObject && textObject.fill) zoneTextColorPicker.value = textObject.fill;
        if (zoneNameToggle && zoneAreaToggle && zoneVolumeToggle && zoneNotesToggle && textObject) {
          const hidden = !!textObject._isHidden;
          if (hidden) {
            zoneNameToggle.checked = false;
            zoneAreaToggle.checked = false;
            zoneVolumeToggle.checked = false;
            zoneNotesToggle.checked = false;
          } else {
            const textLines = (textObject.text || "")
              .split("\n")
              .map((l) => l.trim())
              .filter(Boolean);
            const hasNameLine = textLines.length > 0 && !textLines[0].startsWith("Area:") && !textLines[0].startsWith("Volume:") && !textLines[0].startsWith("Notes:");
            zoneNameToggle.checked = !!hasNameLine;
            zoneAreaToggle.checked = textLines.some((line) => line.startsWith("Area:"));
            zoneVolumeToggle.checked = textLines.some((line) => line.startsWith("Volume:"));
            zoneNotesToggle.checked = textLines.some((line) => line.startsWith("Notes:"));
          }
          updateZoneText();
        }
      } else if (type === "room") {
        if (roomTextSizeInput && roomTextSizeSlider && textObject) {
          let textSizeValue = textObject.fontSize || 14;
          if (isNaN(textSizeValue) || textSizeValue < 10 || textSizeValue > 30) textSizeValue = 14;
          roomTextSizeInput.textContent = textSizeValue + "px";
          roomTextSizeSlider.value = textSizeValue;
          textObject.fontSize = textSizeValue;
          updateSliderTrack(roomTextSizeSlider, textSizeValue, 10, 30);
        }
        if (roomColorPicker && polygon.stroke) roomColorPicker.value = getHexFromFill(polygon.stroke);
        if (roomTextColorPicker && textObject && textObject.fill) roomTextColorPicker.value = getHexFromFill(textObject.fill);
        if (roomNameToggle && roomAreaToggle && roomVolumeToggle && roomNotesToggle && textObject) {
          const hidden = !!textObject._isHidden;
          if (hidden) {
            roomNameToggle.checked = false;
            roomAreaToggle.checked = false;
            roomVolumeToggle.checked = false;
            roomNotesToggle.checked = false;
          } else {
            const textLines = (textObject.text || "")
              .split("\n")
              .map((l) => l.trim())
              .filter(Boolean);
            const hasNameLine = textLines.length > 0 && !textLines[0].startsWith("Area:") && !textLines[0].startsWith("Volume:") && !textLines[0].startsWith("Notes:");
            roomNameToggle.checked = !!hasNameLine;
            roomAreaToggle.checked = textLines.some((line) => line.startsWith("Area:"));
            roomVolumeToggle.checked = textLines.some((line) => line.startsWith("Volume:"));
            roomNotesToggle.checked = textLines.some((line) => line.startsWith("Notes:"));
          }
          updateRoomText();
        }
      }
    },
    // Clears appearance panel state
    clearAppearancePanel: () => {
      // Sliders and toggles keep their current values
    },
  };
}
