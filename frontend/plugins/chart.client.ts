import {
  Chart,
  BarElement,
  BarController,
  LineElement,
  LineController,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from 'chart.js';

export default defineNuxtPlugin(() => {
  Chart.register(
    BarElement,
    BarController,
    LineElement,
    LineController,
    PointElement,
    CategoryScale,
    LinearScale,
    Tooltip,
    Legend,
  );
});
