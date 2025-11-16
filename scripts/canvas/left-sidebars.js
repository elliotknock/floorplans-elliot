import { initializeDrawingTools } from "../drawing/drawing-utils.js";
import { setupDeviceItemDrag } from "../devices/drag-drop-devices.js";
import { setupReplaceBackgroundHandler } from "../background/select-background.js";

document.addEventListener("DOMContentLoaded", function () {
  const subSidebar = document.getElementById("sub-sidebar");
  const subSidebarTitle = document.getElementById("sub-sidebar-title");
  const closeSidebarBtn = document.getElementById("close-sub-sidebar");
  const loadProjectBtn = document.getElementById("load-project-btn");
  const mainSidebarBtns = document.querySelectorAll(".sidebar-btn[data-menu]");
  const allSubmenus = document.querySelectorAll(".submenu");

  // Title mapping for each submenu
  const titleMap = {
    "project-options-submenu": "Project Options",
    "add-devices-submenu": "Add Devices",
    "layer-controls-submenu": "Layer Controls",
    "drawing-tools-submenu": "Drawing Tools",
    "client-details-submenu": "Client Details",
    "settings-submenu": "Settings",
  };

  // Function to show specific submenu and update title
  function showSubmenu(menuId) {
    // Hide all submenus first
    allSubmenus.forEach((menu) => {
      menu.style.display = "none";
    });

    // Show the target submenu
    const targetSubmenu = document.getElementById(menuId);
    if (targetSubmenu) {
      targetSubmenu.style.display = "block";

      // Update the title
      const newTitle = titleMap[menuId] || "Menu";
      subSidebarTitle.textContent = newTitle;

      // Show the sidebar
      subSidebar.classList.remove("hidden");

      // Initialize drawing tools functionality if showing drawing tools menu
      if (menuId === "drawing-tools-submenu") {
        setTimeout(() => {
          initializeDrawingTools();
        }, 100);
      }
    }
  }

  // Function to hide sidebar
  function hideSidebar() {
    subSidebar.classList.add("hidden");

    // Reset title to default
    subSidebarTitle.textContent = "Menu";

    // Hide all submenus
    allSubmenus.forEach((menu) => {
      menu.style.display = "none";
    });
  }

  // Add click event listeners to main sidebar buttons
  mainSidebarBtns.forEach((btn) => {
    btn.addEventListener("click", function () {
      const menuId = this.getAttribute("data-menu");
      if (menuId) {
        showSubmenu(menuId);
      }
    });
  });

  // Add click event listener to close button
  if (closeSidebarBtn) {
    closeSidebarBtn.addEventListener("click", function () {
      hideSidebar();
    });
  }

  // Add click event listener to close button
  if (loadProjectBtn) {
    loadProjectBtn.addEventListener("click", function () {
      hideSidebar();
    });
  }

  // Setup replace background handler
  setupReplaceBackgroundHandler();

  // Close sidebar when clicking outside of it
  document.addEventListener("click", function (event) {
    // Check if the click was outside the sidebar and main sidebar
    const isClickInsideSidebar = subSidebar.contains(event.target);
    const isClickInsideMainSidebar = document.getElementById("sidebar").contains(event.target);

    // If sidebar is visible and click is outside both sidebars
    if (!subSidebar.classList.contains("hidden") && !isClickInsideSidebar && !isClickInsideMainSidebar) {
      hideSidebar();
    }
  });

  // Device submenu navigation (for add-devices-submenu)
  const closeSubSidebarBtn = document.getElementById("close-sub-sidebar");

  // Hides all submenus (for device submenus)
  function hideAllDeviceSubmenus() {
    document.querySelectorAll(".submenu").forEach((submenu) => {
      submenu.classList.add("hidden");
      submenu.classList.remove("show");
    });
  }

  // Shows a specific device submenu
  function showDeviceSubmenu(menuId) {
    hideAllDeviceSubmenus();
    const submenu = document.getElementById(menuId);
    if (submenu) {
      submenu.classList.remove("hidden");
      submenu.classList.add("show");
      subSidebar.classList.remove("hidden");
    }
  }

  // Sets up sidebar navigation event listeners for device submenus
  document.querySelectorAll(".sidebar-btn").forEach((button) => {
    const menuType = button.getAttribute("data-menu");
    if (menuType && menuType !== "project-options-submenu" && menuType !== "drawing-tools-submenu" && menuType !== "layer-controls-submenu" && menuType !== "client-details-submenu" && menuType !== "settings-submenu") {
      button.addEventListener("click", () => {
        showDeviceSubmenu(menuType);
      });
    }
  });

  document.querySelectorAll(".toggle-device-dropdown").forEach((button) => {
    button.addEventListener("click", () => {
      window.toggleSubMenu(button);
    });
  });

  if (closeSubSidebarBtn) {
    closeSubSidebarBtn.addEventListener("click", () => {
      subSidebar.classList.add("hidden");
      hideAllDeviceSubmenus();
    });
  }

  // Defines global toggle submenu function for device dropdowns
  window.toggleSubMenu = function (button) {
    const container = button.parentElement;
    const deviceRows = container.querySelectorAll(".device-row");
    const icon = button.querySelector(".dropdown-icon");

    deviceRows.forEach((row) => row.classList.toggle("show"));
    if (icon) icon.classList.toggle("rotate");
  };

  // Setup drag functionality for device items
  setupDeviceItemDrag();
});

