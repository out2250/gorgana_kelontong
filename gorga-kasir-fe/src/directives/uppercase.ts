// v-uppercase directive: force input to uppercase except description
export default {
  mounted(el: HTMLElement, binding: { arg?: string }) {
    if ((el as HTMLInputElement | HTMLTextAreaElement).tagName !== "INPUT" && (el as HTMLInputElement | HTMLTextAreaElement).tagName !== "TEXTAREA") return;
    if (binding?.arg === "desc" || (el as HTMLInputElement | HTMLTextAreaElement).name === "description" || (el as HTMLInputElement | HTMLTextAreaElement).id === "description") return;
    el.addEventListener("input", (e: Event) => {
      const inputEl = el as HTMLInputElement;
      if (inputEl.type === "text" || inputEl.type === undefined) {
        inputEl.value = inputEl.value.toUpperCase();
        const event = new Event("input", { bubbles: true });
        inputEl.dispatchEvent(event);
      }
    });
  }
};
