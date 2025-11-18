import { defineStore } from 'pinia'

export const usePlayerStore = defineStore('player', {
  state: () => ({
    queue: [],
    currentIndex: 0
  }),
  getters: {
    currentTrack(state) {
      return state.queue[state.currentIndex] || null
    }
  },
  actions: {
    setQueue(tracks) {
      this.queue = tracks
      this.currentIndex = 0
    },
    nextTrack() {
      if (this.currentIndex < this.queue.length - 1) {
        this.currentIndex += 1
      }
    },
    prevTrack() {
      if (this.currentIndex > 0) {
        this.currentIndex -= 1
      }
    },
    setCurrentIndex(index) {
      if (index >= 0 && index < this.queue.length) {
        this.currentIndex = index
      }
    }
  }
})
