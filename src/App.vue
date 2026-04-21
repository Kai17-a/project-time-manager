<template>
  <div class="mx-5 my-3">
    <div class="flex">
      <div
        class="grow flex align-items-center justify-content-center font-bold"
      >
        <Button
          v-for="project in projects"
          :key="project.id"
          :label="project.name"
          class="m-3"
          @click="punchTime(project.id)"
        />

        <Button
          icon="pi pi-plus"
          class="m-3"
          severity="secondary"
          @click="registerDialog = true"
        />
        <Button
          icon="pi pi-minus"
          class="m-3"
          severity="danger"
          @click="deleteDialog = true"
        />
      </div>
    </div>
    <Divider />
    <div class="flex flex-row-reverse flex-wrap">
      <Select v-model="selectDate" :options="savedDates" optionLabel="date" />
    </div>
    <DataTable :value="times">
      <Column field="name" header="Name"></Column>
      <Column field="status" header="Status"></Column>
      <Column field="total" header="Total(h)"></Column>
    </DataTable>
  </div>

  <Dialog
    v-model:visible="registerDialog"
    modal
    header="New Project"
    :style="{ width: '25rem' }"
  >
    <div class="flex items-center gap-4 mb-4">
      <InputText
        v-model="newProject"
        id="username"
        class="flex-auto"
        autocomplete="off"
        maxlength="7"
      />
    </div>
    <div class="flex justify-end gap-2">
      <Button
        type="button"
        label="Cancel"
        severity="secondary"
        @click="registerDialog = false"
      ></Button>
      <Button type="button" label="Save" @click="saveProject()"></Button>
    </div>
  </Dialog>
  <Dialog
    v-model:visible="deleteDialog"
    modal
    header="Delete Project"
    :style="{ width: '25rem' }"
  >
    <div class="flex items-center gap-4 mb-4">
      <Select
        v-model="selectDeleteProject"
        :options="projects"
        optionLabel="name"
        class="w-full"
        placeholder="Select project"
      />
    </div>
    <div class="flex justify-end gap-2">
      <Button
        type="button"
        label="Cancel"
        severity="secondary"
        @click="deleteDialog = false"
      ></Button>
      <Button
        type="button"
        label="Delete"
        severity="danger"
        @click="deleteProject()"
      ></Button>
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import Database from "@tauri-apps/plugin-sql";

const errorMsg = ref("");

const dt = new Date();
const today = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
const selectDate = ref({
  id: 0,
  date: today,
});
const savedDates = ref([
  {
    id: 0,
    date: today,
  },
]);

// 案件名取得
const projects = ref();
const getProjectsPending = ref(false);
const getProjects = async () => {
  if (getProjectsPending.value) return;

  getProjectsPending.value = true;
  try {
    const db = await Database.load("sqlite:project-time-manager.db");
    const results = await db.select("SELECT id, name FROM projects");
    projects.value = results;
  } catch (error) {
    if (error instanceof Error) errorMsg.value = error.message;
  } finally {
    getProjectsPending.value = false;
  }
};

// 過去打刻取得
const times = ref();
const getTimePending = ref(false);
const getTime = async () => {
  if (getTimePending.value) return;

  getTimePending.value = true;
  try {
    const db = await Database.load("sqlite:project-time-manager.db");
    const results = await db.select(
      `
      SELECT
        projects.id AS project_id,
        projects.name,
        date,
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM detail AS running
            WHERE running.project_id = detail.project_id
              AND running.date = detail.date
              AND running.clock_out = ''
          ) THEN '進行中'
          ELSE ''
        END AS status,
        COALESCE(
          ROUND(SUM((julianday(clock_out) - julianday(clock_in)) * 24 * 60 * 60) / 3600, 2),
          0
        ) AS total
      FROM detail
      JOIN projects ON projects.id = detail.project_id
      WHERE detail.date = $1
      GROUP BY project_id, date
      ORDER BY project_id, date;
    `,
      [selectDate.value.date],
    );
    times.value = results;
  } catch (error) {
    if (error instanceof Error) errorMsg.value = error.message;
  } finally {
    getTimePending.value = false;
  }
};

watch(
  () => selectDate.value.date,
  async () => {
    await getTime();
  },
);

const getSavedTimesPending = ref(false);
const getSavedTimes = async () => {
  if (getSavedTimesPending.value) return;

  getSavedTimesPending.value = true;
  try {
    const db = await Database.load("sqlite:project-time-manager.db");
    const results = await db.select(
      `
      SELECT DISTINCT date
      FROM detail
      WHERE date <> $1
      ORDER BY date DESC
    `,
      [today],
    );
    savedDates.value = [
      {
        id: 0,
        date: selectDate.value.date,
      },
      ...results.map((row, index) => ({
        id: index + 1,
        date: row.date,
      })),
    ];
  } catch (error) {
    if (error instanceof Error) errorMsg.value = error.message;
  } finally {
    getSavedTimesPending.value = false;
  }
};

const punchTimePending = ref(false);
const formatDateTime = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

const punchTime = async (projectId: number) => {
  if (punchTimePending.value) return;

  punchTimePending.value = true;
  try {
    const db = await Database.load("sqlite:project-time-manager.db");
    const now = formatDateTime(new Date());
    const openRows = await db.select(
      `
      SELECT id, project_id
      FROM detail
      WHERE date = $1
        AND clock_out = ''
      ORDER BY id DESC
      LIMIT 1
    `,
      [selectDate.value.date],
    );

    if (openRows.length > 0) {
      const currentOpenRow = openRows[0];
      await db.execute("UPDATE detail SET clock_out = $1 WHERE id = $2", [
        now,
        currentOpenRow.id,
      ]);

      if (currentOpenRow.project_id === projectId) {
        await Promise.all([getTime(), getSavedTimes()]);
        return;
      }
    }

    await db.execute(
      `
      INSERT INTO detail (date, project_id, clock_in, clock_out)
      VALUES ($1, $2, $3, '')
    `,
      [selectDate.value.date, projectId, now],
    );

    await Promise.all([getTime(), getSavedTimes()]);
  } catch (error) {
    if (error instanceof Error) errorMsg.value = error.message;
  } finally {
    punchTimePending.value = false;
  }
};

// プロジェクト登録
const registerDialog = ref(false);
const newProject = ref("");
const savePending = ref(false);
const saveProject = async () => {
  if (savePending.value) return;

  savePending.value = true;
  try {
    const db = await Database.load("sqlite:project-time-manager.db");
    await db.execute("INSERT into projects (name) VALUES ($1)", [
      newProject.value,
    ]);
  } catch (error) {
    if (error instanceof Error) errorMsg.value = error.message;
  } finally {
    newProject.value = "";
    savePending.value = false;
    registerDialog.value = false;
    await Promise.all([getProjects(), getSavedTimes(), getTime()]);
  }
};

// プロジェクト削除
const deleteDialog = ref(false);
const selectDeleteProject = ref();
const deletePending = ref(false);
const deleteProject = async () => {
  if (deletePending.value) return;

  deletePending.value = true;
  try {
    const db = await Database.load("sqlite:project-time-manager.db");
    await db.execute("DELETE FROM projects WHERE id = $1", [
      selectDeleteProject.value.id,
    ]);
  } catch (error) {
    if (error instanceof Error) errorMsg.value = error.message;
  } finally {
    selectDeleteProject.value = {};
    deletePending.value = false;
    deleteDialog.value = false;
    await getProjects();
  }
};

onMounted(async () => {
  await Promise.all([getProjects(), getSavedTimes(), getTime()]);
});
</script>

<style scoped></style>
