# Figma Design Tokens Extraction

Extract design tokens from a Figma file and generate code in multiple formats.

## What to Provide

Please provide:
- **Figma File URL** (e.g., `https://figma.com/file/ABC123/DesignSystem`)
- **Optional:** Specific node ID if you want tokens from a specific frame

## What I'll Extract

Using Figma MCP variable definitions and metadata:

### 1. **Color Palette**
- All color styles (Primary, Secondary, Gray scales)
- Semantic colors (Success, Warning, Error, Info)
- Light/Dark mode variants

### 2. **Typography**
- Text styles (H1-H6, Body, Caption, etc.)
- Font families, sizes, weights
- Line heights and letter spacing

### 3. **Spacing System**
- Layout constraints
- Padding and margin values
- Gap values from auto-layout

### 4. **Effects**
- Shadows (box-shadow)
- Blur effects
- Opacity values

### 5. **Border Radius**
- Corner radius values
- Rounded button styles

## Output Formats

I'll generate tokens in:

### **1. CSS Variables**
```css
:root {
  --color-primary-500: #FFB13B;
  --spacing-md: 16px;
  --font-size-h1: 48px;
}
```

### **2. JavaScript/TypeScript**
```typescript
export const colors = {
  primary: { 500: '#FFB13B' }
};
```

### **3. Tailwind Config**
```javascript
module.exports = {
  theme: {
    extend: {
      colors: { primary: '#FFB13B' }
    }
  }
}
```

### **4. MUI Theme**
```typescript
const theme = createTheme({
  palette: {
    primary: { main: '#FFB13B' }
  }
});
```

## Please Provide

**Figma File URL:**

**Optional - Specific frame/node ID:**

**Preferred output format(s):** (CSS / TypeScript / Tailwind / MUI / All)
