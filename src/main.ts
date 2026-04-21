import { createApp } from "vue";
import PrimeVue from "primevue/config";
import Aura from "@primeuix/themes/aura";
import "./assets/css/main.css";
import "../node_modules/primeflex/primeflex.css";
import "primeicons/primeicons.css";

import Button from "primevue/button";
import Card from "primevue/card";
import Divider from "primevue/divider";
import DataTable from "primevue/datatable";
import Column from "primevue/column";
import Select from "primevue/select";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";

import App from "./App.vue";

const app = createApp(App);
app.use(PrimeVue, {
  theme: {
    preset: Aura,
  },
});

app.component("Button", Button);
app.component("Card", Card);
app.component("Divider", Divider);
app.component("Column", Column);
app.component("DataTable", DataTable);
app.component("Select", Select);
app.component("Dialog", Dialog);
app.component("InputText", InputText);

app.mount("#app");
