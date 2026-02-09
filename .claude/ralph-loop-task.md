# Development Tasks

**CRITICAL: Do NOT commit any code. Do NOT run git commit. Only write code changes.**

## Task 1: AI Chat - Render Inline Trading Widget Cards from Contract Addresses in Messages

### Description
In the AI chat page, when a user message contains a contract address (Solana or EVM), the chat bubble should detect it and render an inline trading widget card (the same widget used in regular chat messages - `InlineTradingWidgetNode`).

### Requirements
- Detect contract addresses in AI chat message text (Solana base58 addresses, EVM 0x addresses)
- When detected, render the `InlineTradingWidgetNode` below the message text inside the chat bubble
- Reuse existing `ChatMessageContractAddressBubbleContentNode` or similar pattern
- The widget should show token chart, price info, and trade buttons as it does in regular chat
- Must work with the existing AI chat message rendering system

### Key Files to Investigate
- Existing inline widget implementation in regular chat: `ChatMessageContractAddressBubbleContentNode`
- AI chat message rendering: Look for AI chat / assistant chat related nodes
- `InlineTradingWidgetNode` - the widget to embed
- Contract address detection: `ContractAddress` model/utilities

## Task 2: AI Chat - Add Web Search Tool for Web3 Information

### Description
Add a new AI tool that enables web search capability in the AI chat. When users ask about Web3 topics, the AI can search the internet for real-time news, Twitter posts, and other Web3 information.

### Requirements
- Add a new tool definition to the AI chat's tool system
- The tool should be able to search web for Web3 news and information
- Should be able to search/aggregate Twitter/X posts about crypto topics
- Look for FREE APIs first (can be replaced with paid ones later):
  - Consider RapidAPI for Twitter search
  - Consider free news APIs (NewsAPI, Google News RSS, etc.)
  - Consider crypto-specific news APIs (CryptoPanic, etc.)
  - Consider Brave Search API (free tier available)
  - Consider SerpAPI or similar
- Should return 10-50 results when searching
- Results should include title, snippet/content, URL, date, and source
- The AI should be able to use this tool when users ask about Web3 news, token information, market trends, etc.

### Key Areas to Investigate
- Existing AI chat tool system: How are tools defined and registered?
- AI chat service layer: Where API calls to AI backend are made
- Backend API: Check if there's a backend proxy for AI tools or if tools are client-side
- Look at how existing tools (if any) are implemented in the AI chat

## General Notes
- Do NOT commit any code
- Build and verify after implementing each task
- Follow existing code patterns and architecture
- Use NSLog for debugging, never print
- Import Display when using AsyncDisplayKit types
