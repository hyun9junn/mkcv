const sections = (() => {
  const SECTION_DEFS = {
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
        '    year: "2020"',
        "",
      ].join("\n"),
    },
    skills: {
      label: "Skills",
      yaml: [
        "skills:",
        "  - category: Languages",
        "    items: [Python, JavaScript]",
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

  const header = document.getElementById("sections-header");
  const panel = document.getElementById("sections-panel");
  let isPanelOpen = false;
  const checkboxes = {};

  function togglePanel() {
    isPanelOpen = !isPanelOpen;
    panel.style.display = isPanelOpen ? "flex" : "none";
    header.querySelector("span").textContent = isPanelOpen ? "Sections ▴" : "Sections ▾";
  }

  function getPresentSections(yaml) {
    try {
      const parsed = jsyaml.load(yaml);
      if (!parsed || typeof parsed !== "object") return null;
      return new Set(Object.keys(parsed));
    } catch {
      return null;
    }
  }

  function updateCheckboxes(yaml) {
    const present = getPresentSections(yaml);
    for (const [key, cb] of Object.entries(checkboxes)) {
      if (present === null) {
        cb.indeterminate = true;
        cb.checked = false;
      } else {
        cb.indeterminate = false;
        cb.checked = present.has(key);
      }
    }
  }

  function enableSection(key) {
    const current = window.editorAdapter.getValue();
    const snippet = "\n" + SECTION_DEFS[key].yaml;
    const updated = current.trimEnd() + snippet;
    window.editorAdapter.setValue(updated);
    app.setState({ yaml: updated });
  }

  function disableSection(key) {
    const current = window.editorAdapter.getValue();
    let parsed;
    try {
      parsed = jsyaml.load(current);
    } catch {
      return;
    }
    if (!parsed || typeof parsed !== "object") return;
    delete parsed[key];
    const updated = jsyaml.dump(parsed, { lineWidth: -1 });
    window.editorAdapter.setValue(updated);
    app.setState({ yaml: updated });
  }

  function buildPanel() {
    panel.innerHTML = "";
    for (const [key, def] of Object.entries(SECTION_DEFS)) {
      const label = document.createElement("label");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.addEventListener("change", () => {
        if (cb.indeterminate) return;
        if (cb.checked) {
          enableSection(key);
        } else {
          disableSection(key);
        }
      });
      checkboxes[key] = cb;
      label.appendChild(cb);
      label.appendChild(document.createTextNode(def.label));
      panel.appendChild(label);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    header.addEventListener("click", togglePanel);
    buildPanel();
    window.editorAdapter.onChange((yaml) => updateCheckboxes(yaml));
    updateCheckboxes(app.state.yaml);
  });
})();
