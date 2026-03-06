import "./style.css";

import * as Sentry from "@sentry/vue";
import { createPinia } from "pinia";
import { createApp } from "vue";

import App from "./App.vue";
import router from "./router";
import { useUiPreferencesStore } from "./store/ui-preferences";

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);

if (import.meta.env.VITE_SENTRY_DSN) {
	Sentry.init({
		app,
		dsn: import.meta.env.VITE_SENTRY_DSN,
		environment: import.meta.env.VITE_APP_ENV ?? "development",
		tracesSampleRate: 0.2
	});
}

const uiPreferences = useUiPreferencesStore(pinia);
uiPreferences.applyToDocument();

app.mount("#app");
