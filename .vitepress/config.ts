import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Coldgust",
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Blogs', link: '/blogs/index.md'},
      { text: 'Documents', link: '/docs/index.md' }
    ],

    sidebar: [
      {
        text: 'Blogs and Docs',
        items: [
          { text: 'blogs', link: '/blogs/index.md' },
          { text: 'docs', link: '/docs/index.md' }
        ]
      }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/coldgust'}
    ]
  }
})
