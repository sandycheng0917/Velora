// Tailwind 已移除：本專案的設計 token 直接寫在 src/style.css。
// 規範把每個字距、行距、髮絲線與陰影都指定死了，用 utility class 反而要大量
// arbitrary value，可讀性更差；純 CSS 也讓 tailwind v4/v3 的設定衝突一併消失。
export default {
  plugins: {
    autoprefixer: {},
  },
}
