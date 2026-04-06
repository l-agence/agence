# VS Code Environment Setup Instructions

To ensure your environment variables (like OPENROUTER_API_KEY) are available to VS Code and its extensions, follow these steps:

1. Add the following to your shell profile (e.g., ~/.bashrc, ~/.zshrc, ~/.profile):

    [ -r ~/.agence/.agencrc ] && source ~/.agence/.agencrc

2. If you use a shell inside VS Code, make sure it launches as a login shell or sources your profile.

3. For Continue and other extensions, environment variables must be set before launching VS Code. If you change ~/.agence/.agencrc, restart VS Code to pick up changes.

4. If you use config.yaml for Continue, ensure it is referenced in your Continue extension settings or copied to the expected location (e.g., ~/.continue/config.yaml or .continue/config.yaml in your project root).

5. You can check if the variable is set in VS Code's terminal with:

    echo $OPENROUTER_API_KEY

---

# Summary
- Source ~/.agence/.agencrc in your shell profile
- Restart VS Code after changes
- Ensure config.yaml is in the correct location for Continue
