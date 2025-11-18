<script setup>
const props = defineProps({
  columns: {
    type: Array,
    required: true
  },
  modelValue: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['update:modelValue'])

function toggleColumn(key) {
  const visible = new Set(props.modelValue)
  if (visible.has(key)) {
    visible.delete(key)
  } else {
    visible.add(key)
  }
  const column = props.columns.find((col) => col.key === key)
  if (column?.locked && !visible.has(key)) {
    visible.add(key)
  }
  if (visible.size === 0) {
    visible.add(props.columns[0].key)
  }
  emit('update:modelValue', Array.from(visible))
}
</script>

<template>
  <div class="dropdown column-toggle">
    <button class="btn btn-outline-secondary dropdown-toggle" data-bs-toggle="dropdown">
      Visible Columns
    </button>
    <div class="dropdown-menu p-3" style="min-width: 220px">
      <div v-for="column in columns" :key="column.key" class="form-check mb-2">
        <input
          class="form-check-input"
          type="checkbox"
          :id="`col-${column.key}`"
          :checked="modelValue.includes(column.key)"
          :disabled="column.locked"
          @change="toggleColumn(column.key)"
        />
        <label class="form-check-label" :for="`col-${column.key}`">
          {{ column.label }}
        </label>
      </div>
    </div>
  </div>
</template>
