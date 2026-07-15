import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

export default defineConfig({
  integrations: [
    starlight({
      title: "SkillSmith",
      social: [
        { icon: "github", label: "GitHub", href: "https://github.com/skillsmith/skillsmith" },
      ],
      sidebar: [
        { label: "Getting Started", link: "/" },
        { label: "Skill Spec", link: "/spec/format" },
      ],
    }),
  ],
});
