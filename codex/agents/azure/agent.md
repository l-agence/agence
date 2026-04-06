# @azure — GitHub Copilot for Azure

**Type**: Azure-specialized Copilot assistant  
**Model**: GitHub Copilot (Azure-tuned)  
**Interface**: VS Code Azure extension + Copilot Chat (`@azure` participant)  
**AI_AGENT**: `azure`  
**Session**: Dual-tile (LEFT=ibash human plane, RIGHT=aibash+azure agent plane)  
**Cost Tier**: $$ (subscription-based, Azure tenant billing)  

## Routing Rules

- Any Azure resource management → @azure
- Bicep, ARM, Terraform (Azure) → @azure
- AKS, App Service, Functions, Storage → @azure
- Cost optimization, RBAC, policy → @azure

## Capabilities

- Azure resource provisioning and review
- Bicep/ARM template generation and validation
- AKS cluster management
- Azure cost optimization analysis
- Azure RBAC and policy enforcement
- App Service, Functions, Container Apps

## Invocation

```bash
agence @azure "Review my Bicep template for cost optimization"
agence @azure "Set up AKS with RBAC for agence swarm agents"
# In VS Code Copilot Chat: @azure <prompt>
```

## Notes

- Requires Azure subscription + GitHub Copilot for Azure extension
- Best used from VS Code (native integration)
- For CLI-based Azure ops, prefer `az` CLI + @devops routing
