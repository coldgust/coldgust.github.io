import { sidebar } from "vuepress-theme-hope";

export default sidebar({
  "/": [
    "intro",
  ],
  "/posts/": [
    {
      text: "随笔",
      icon: "book",
      prefix: "",
      children: "structure",
    },
  ],
});
