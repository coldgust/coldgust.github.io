import { defineConfig } from "vitepress";

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Coldgust",
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: "Home", link: "/" },
      {
        text: "分类",
        items: [
          {
            text: "Linux性能分析",
            link: "/linux-performance/index.md",
          },
        ],
      },
    ],

    sidebar: {
      "linux-performance": [
        {
          text: "Linux性能分析",
          items: [{ text: "预览", link: "/linux-performance/index.md" }],
        },
      ],
    },

    socialLinks: [{ icon: "github", link: "https://github.com/coldgust" }],
  },
});
