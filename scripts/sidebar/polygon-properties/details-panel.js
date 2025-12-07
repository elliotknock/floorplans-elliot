import { preventEventPropagation, wrapGlobalFunction, createSliderInputSync, updateSliderTrack, updateWarningText } from "../sidebar-utils.js";
import { getHexFromFill } from "../sidebar-utils.js";
import { updateDevicesList } from "../sidebar-utils.js";
import { initAppearancePanel } from "./appearance-panel.js";

// Stores the currently selected zone or room
let currentPolygon = null;
let currentTextObject = null;
let currentZone = null;
let currentRoom = null;
let currentRoomPolygon = null;
let currentRoomText = null;

// Sets up the details panel for zones and rooms with name, notes, height, and device lists
export function initDetailsPanel() {
  // Zone controls
  const zoneNameInput = document.getElementById("zone-label-input");
  const zoneNotesInput = document.getElementById("zone-notes-input");
  const zoneNumberInput = document.getElementById("zone-number-input");
  const zoneResistanceInput = document.getElementById("zone-resistance-value-input");

  // Room controls
  const roomLabelInput = document.getElementById("room-label-input");
  const roomNotesInput = document.getElementById("room-notes-input");

  // Height sliders
  const zoneHeightInput = document.getElementById("zone-height-input");
  const zoneHeightSlider = document.getElementById("zone-height-slider");
  const zoneWarning = document.getElementById("zone-warning");
  const roomHeightInput = document.getElementById("room-height-input");
  const roomHeightSlider = document.getElementById("room-height-slider");
  const roomWarning = document.getElementById("room-warning");

  // Handles typing in zone name input
  if (zoneNameInput) {
    zoneNameInput.addEventListener("input", (e) => {
      if (currentPolygon && currentTextObject && currentPolygon.canvas) {
        currentPolygon.zoneName = e.target.value;
        if (window.updateZoneText) window.updateZoneText();
      }
    });
    preventEventPropagation(zoneNameInput);
  }

  // Handles typing in zone notes input
  if (zoneNotesInput) {
    zoneNotesInput.addEventListener("input", (e) => {
      if (currentPolygon && currentTextObject && currentPolygon.canvas) {
        currentPolygon.zoneNotes = e.target.value;
        if (window.updateZoneText) window.updateZoneText();
      }
    });
    preventEventPropagation(zoneNotesInput);
  }

  // Handles typing in zone number input
  if (zoneNumberInput) {
    zoneNumberInput.addEventListener("input", (e) => {
      if (currentPolygon && currentTextObject && currentPolygon.canvas) {
        const v = (e.target.value || "").trim();
        currentPolygon.zoneNumber = v;
      }
    });
    preventEventPropagation(zoneNumberInput);
  }

  // Handles typing in zone resistance value input
  if (zoneResistanceInput) {
    zoneResistanceInput.addEventListener("input", (e) => {
      if (currentPolygon && currentTextObject && currentPolygon.canvas) {
        const v = (e.target.value || "").trim();
        currentPolygon.zoneResistanceValue = v;
      }
    });
    preventEventPropagation(zoneResistanceInput);
  }

  // Handles typing in room name input
  if (roomLabelInput) {
    roomLabelInput.addEventListener("input", (e) => {
      if (currentRoom && currentRoomPolygon && currentRoomText && currentRoomPolygon.canvas) {
        const newName = e.target.value.trim() || `Room ${window.rooms.indexOf(currentRoom) + 1}`;
        currentRoom.roomName = newName;
        currentRoomPolygon.roomName = newName;
        if (window.updateRoomText) window.updateRoomText();
      }
    });
    preventEventPropagation(roomLabelInput);
  }

  // Handles typing in room notes input
  if (roomNotesInput) {
    roomNotesInput.addEventListener("input", (e) => {
      if (currentRoom && currentRoomPolygon && currentRoomText && currentRoomPolygon.canvas) {
        const newNotes = e.target.value.trim();
        currentRoom.roomNotes = newNotes;
        currentRoomPolygon.roomNotes = newNotes;
        if (window.updateRoomText) window.updateRoomText();
      }
    });
    preventEventPropagation(roomNotesInput);
  }

  // Sets up zone height slider
  if (zoneHeightSlider && zoneHeightInput) {
    createSliderInputSync(
      zoneHeightSlider,
      zoneHeightInput,
      (height) => {
        if (currentPolygon && currentTextObject && currentPolygon.canvas) {
          currentTextObject.displayHeight = height;
          if (zoneWarning) updateWarningText(zoneWarning, height);
          if (window.updateZoneText) window.updateZoneText();
        }
      },
      { min: 1, max: 10, step: 0.01, precision: 2, format: (value) => value.toFixed(2) + "m" }
    );
    preventEventPropagation(zoneHeightInput, ["click"]);
    preventEventPropagation(zoneHeightSlider, ["click"]);
  }

  // Sets up room height slider
  if (roomHeightSlider && roomHeightInput) {
    createSliderInputSync(
      roomHeightSlider,
      roomHeightInput,
      (height) => {
        if (currentRoom && currentRoomText && currentRoomPolygon && currentRoomPolygon.canvas) {
          currentRoomText.displayHeight = height;
          currentRoom.height = height;
          if (roomWarning) updateWarningText(roomWarning, height);
          if (window.updateRoomText) window.updateRoomText();
        }
      },
      { min: 1, max: 10, step: 0.01, precision: 2, format: (value) => value.toFixed(2) + "m" }
    );
    preventEventPropagation(roomHeightInput, ["click"]);
    preventEventPropagation(roomHeightSlider, ["click"]);
  }

  // Updates the list of devices inside a zone
  function updateZoneDevicesList(zone, fabricCanvas) {
    const zoneDevicesList = document.getElementById("zone-devices-list");
    if (zoneDevicesList && zone && zone.polygon && fabricCanvas) {
      updateDevicesList(zoneDevicesList, zone.polygon, fabricCanvas, true);
    }
  }

  // Updates the list of devices inside a room
  function updateRoomDevicesList(room, fabricCanvas) {
    const roomDevicesList = document.getElementById("room-devices-list");
    if (roomDevicesList && room && room.polygon && fabricCanvas) {
      updateDevicesList(roomDevicesList, room.polygon, fabricCanvas, false);
    }
  }

  return {
    getCurrentZone: () => ({ currentPolygon, currentTextObject, currentZone }),
    getCurrentRoom: () => ({ currentRoom, currentRoomPolygon, currentRoomText }),
    setCurrentZone: (polygon, textObject, zone) => {
      currentPolygon = polygon;
      currentTextObject = textObject;
      currentZone = zone;
    },
    setCurrentRoom: (room, polygon, text) => {
      currentRoom = room;
      currentRoomPolygon = polygon;
      currentRoomText = text;
    },
    updateDetailsPanel: (deviceType, textObject, polygon, fourthParam) => {
      if (deviceType === "zone-polygon") {
        currentPolygon = polygon;
        currentTextObject = textObject;
        currentZone = window.zones ? window.zones.find((zone) => zone.polygon === polygon || zone.text === textObject) : null;

        if (zoneNameInput && textObject) {
          const zoneName = textObject.text.split("\n")[0] || polygon.zoneName;
          zoneNameInput.value = zoneName || "";
        }
        if (zoneNotesInput) {
          const notesLine = textObject?.text?.split("\n").find((line) => line.startsWith("Notes:"));
          const zoneNotes = notesLine ? notesLine.replace("Notes: ", "") : polygon.zoneNotes || "";
          zoneNotesInput.value = zoneNotes;
        }
        if (zoneNumberInput) {
          zoneNumberInput.value = polygon.zoneNumber !== undefined && polygon.zoneNumber !== null ? String(polygon.zoneNumber) : polygon.zoneNumber || "";
        }
        if (zoneResistanceInput) {
          zoneResistanceInput.value = polygon.zoneResistanceValue !== undefined && polygon.zoneResistanceValue !== null ? String(polygon.zoneResistanceValue) : polygon.zoneResistanceValue || "";
        }
        // Update height slider
        if (zoneHeightInput && zoneHeightSlider && textObject) {
          let heightValue = textObject?.displayHeight !== undefined ? textObject.displayHeight : polygon.height || 2.4;
          if (isNaN(heightValue) || heightValue <= 0 || heightValue > 10) heightValue = 2.4;
          zoneHeightInput.textContent = heightValue.toFixed(2) + "m";
          zoneHeightSlider.value = heightValue;
          if (textObject) textObject.displayHeight = heightValue;
          updateSliderTrack(zoneHeightSlider, heightValue, zoneHeightSlider.min || 1, zoneHeightSlider.max || 10);
          if (zoneWarning) updateWarningText(zoneWarning, heightValue);
        }
        if (currentZone && polygon && polygon.canvas) updateZoneDevicesList(currentZone, polygon.canvas);
      } else if (deviceType === "room-polygon") {
        currentRoomPolygon = polygon;
        currentRoomText = textObject;
        currentRoom = fourthParam; // room object

        if (roomLabelInput && currentRoom) roomLabelInput.value = currentRoom.roomName || "";
        if (roomNotesInput && currentRoom) roomNotesInput.value = currentRoom.roomNotes || "";
        // Update height slider
        if (roomHeightInput && roomHeightSlider && textObject) {
          let heightValue = textObject?.displayHeight !== undefined ? textObject.displayHeight : polygon.height || 2.4;
          if (isNaN(heightValue) || heightValue <= 0 || heightValue > 10) heightValue = 2.4;
          roomHeightInput.textContent = heightValue.toFixed(2) + "m";
          roomHeightSlider.value = heightValue;
          if (textObject) textObject.displayHeight = heightValue;
          updateSliderTrack(roomHeightSlider, heightValue, roomHeightSlider.min || 1, roomHeightSlider.max || 10);
          if (roomWarning) updateWarningText(roomWarning, heightValue);
        }
        if (currentRoom && polygon && polygon.canvas) updateRoomDevicesList(currentRoom, polygon.canvas);
      }
    },
    clearDetailsPanel: () => {
      currentPolygon = null;
      currentTextObject = null;
      currentZone = null;
      currentRoom = null;
      currentRoomPolygon = null;
      currentRoomText = null;
    },
  };
}

// Sets up all polygon panels and connects them together
const initPolygonPropertiesCoordinator = () => {
  const detailsPanelInstance = initDetailsPanel();
  const appearancePanelInstance = initAppearancePanel(detailsPanelInstance);

  wrapGlobalFunction("showDeviceProperties", (deviceType, textObject, polygon, fourthParam) => {
    if (deviceType === "zone-polygon" || deviceType === "room-polygon") {
      detailsPanelInstance.updateDetailsPanel(deviceType, textObject, polygon, fourthParam);

      if (deviceType === "zone-polygon") {
        const { currentPolygon, currentTextObject, currentZone } = detailsPanelInstance.getCurrentZone();
        appearancePanelInstance.updateAppearancePanel("zone", currentPolygon, currentTextObject, currentZone);
      } else {
        const { currentRoom, currentRoomPolygon, currentRoomText } = detailsPanelInstance.getCurrentRoom();
        appearancePanelInstance.updateAppearancePanel("room", currentRoomPolygon, currentRoomText, currentRoom);
      }
    }
  });

  wrapGlobalFunction("hideDeviceProperties", () => {
    detailsPanelInstance.clearDetailsPanel();
    appearancePanelInstance.clearAppearancePanel();
  });

  // Helper function for showing room properties
  window.showRoomProperties = function (roomPolygon, roomText, room) {
    window.showDeviceProperties("room-polygon", roomText, roomPolygon, room);
  };
};

// Waits for the page to load before setting up
if (!window.__polygonPropertiesInitialized) {
  window.__polygonPropertiesInitialized = true;

  const initialize = () => {
    const zoneLabelInput = document.getElementById("zone-label-input");
    const roomLabelInput = document.getElementById("room-label-input");

    if (zoneLabelInput || roomLabelInput) {
      initPolygonPropertiesCoordinator();
    } else {
      setTimeout(initialize, 50);
    }
  };

  if (document.readyState === "complete" || document.readyState === "interactive") {
    initialize();
  } else {
    document.addEventListener("DOMContentLoaded", initialize);
  }
}
