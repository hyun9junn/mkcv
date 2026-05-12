export const SECTION_DEFS = {
  summary: {
    label: "Summary",
    yaml: "summary: >\n  Write a brief professional summary here.\n",
  },
  experience: {
    label: "Experience",
    yaml: [
      "experience:",
      "  - title: Job Title",
      "    company: Company Name",
      '    start_date: "2024"',
      "    highlights:",
      "      - Key achievement",
      "",
    ].join("\n"),
  },
  education: {
    label: "Education",
    yaml: [
      "education:",
      "  - degree: B.S. Your Major",
      "    institution: University Name",
      '    start_date: "2020"',
      '    end_date: "2024"',
      "",
    ].join("\n"),
  },
  skills: {
    label: "Skills",
    yaml: [
      "skills:",
      "  - category: Languages",
      "    items:",
      "      - Python",
      "      - JavaScript",
      "",
    ].join("\n"),
  },
  projects: {
    label: "Projects",
    yaml: [
      "projects:",
      "  - name: Project Name",
      "    description: What it does",
      "    highlights:",
      "      - Key feature",
      "",
    ].join("\n"),
  },
  certifications: {
    label: "Certifications",
    yaml: [
      "certifications:",
      "  - name: Certification Name",
      "    issuer: Issuing Organization",
      '    date: "2024"',
      "",
    ].join("\n"),
  },
  publications: {
    label: "Publications",
    yaml: [
      "publications:",
      "  - title: Paper Title",
      "    venue: Conference or Journal",
      '    date: "2024"',
      "",
    ].join("\n"),
  },
  languages: {
    label: "Languages",
    yaml: [
      "languages:",
      "  - language: English",
      "    proficiency: Native",
      "",
    ].join("\n"),
  },
  awards: {
    label: "Awards",
    yaml: [
      "awards:",
      "  - name: Award Name",
      "    issuer: Awarding Organization",
      '    date: "2024"',
      "",
    ].join("\n"),
  },
  extracurricular: {
    label: "Extracurricular",
    yaml: [
      "extracurricular:",
      "  - title: Activity Name",
      "    organization: Organization Name",
      "    highlights:",
      "      - Key achievement",
      "",
    ].join("\n"),
  },
};

export const DEFAULT_ORDER = Object.keys(SECTION_DEFS);
