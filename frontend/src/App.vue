<script setup>
import { RouterView } from 'vue-router'
import AppNavbar from './components/AppNavbar.vue'
</script>

<template>
  <div class="app-container bg-light min-vh-100">
    <AppNavbar />
    <main class="container py-4">
      <RouterView />
    </main>
  </div>
</template>
