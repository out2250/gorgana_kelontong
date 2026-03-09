// v-uppercase directive: force input to uppercase except description
export default {
  mounted(el, binding) {
    // Only apply to input or textarea
    if (el.tagName !== "INPUT" && el.tagName !== "TEXTAREA") return;
    // If description, skip
    if (binding?.arg === "desc" || el.name === "description" || el.id === "description") return;
    el.addEventListener("input", (e) => {
      // Only for text input
      if (el.type === "text" || el.type === undefined) {
        el.value = el.value.toUpperCase();
        // If using v-model, update the model
        const event = new Event("input", { bubbles: true });
        el.dispatchEvent(event);
      }
    });
  }
};
