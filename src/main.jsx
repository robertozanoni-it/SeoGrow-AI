import { initializeWorkspace } from "./workspaceDatabase.js";

initializeWorkspace().then(() => import("./appMain.jsx")).catch(error => {
  const root = document.getElementById("root");
  const message = document.createElement("p");
  message.setAttribute("role", "alert");
  message.textContent = `Workspace non aperto. I dati precedenti sono conservati. ${error.message}`;
  root.replaceChildren(message);
});
