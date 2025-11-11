# Figma Component Code Generation

Generate production-ready component code from Figma designs using Figma MCP.

## What to Provide

Please provide:

1. **Figma Component URL** (e.g., `https://figma.com/file/ABC123/Button?node-id=1:2`)
2. **Target Framework:** React, Vue, Svelte, Angular, HTML/CSS
3. **Styling Approach:** CSS Modules, Styled Components, Emotion, Tailwind, MUI, Vanilla CSS
4. **Optional:** Component name (default: uses Figma layer name)

## What I'll Generate

Using Figma MCP design context and Code Connect mappings:

### 1. **Component Structure**
- Functional component (React/Vue/etc.)
- Proper component hierarchy
- Semantic HTML elements

### 2. **TypeScript Interface**
```typescript
interface ButtonProps {
  variant?: 'contained' | 'outlined' | 'text';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}
```

### 3. **Styles**
- In your chosen styling approach
- Responsive design (if applicable)
- Hover/focus states
- Design token references

### 4. **Props Mapping**
- Component variants → React props
- Boolean properties → boolean props
- Instance swap → component composition

### 5. **Storybook Story** (Optional)
```typescript
export default {
  title: 'Components/Button',
  component: Button,
};

export const Default = {
  args: {
    children: 'Click me',
    variant: 'contained',
  },
};
```

## Output Format

I'll provide:

✅ **Complete component file** (`Button.tsx`)
✅ **Styles file** (if using CSS Modules/SCSS)
✅ **TypeScript types** (props interface)
✅ **Storybook story** (optional)
✅ **Usage example**
✅ **Implementation notes**

## Best Practices Included

- ✅ Accessibility (ARIA labels, keyboard navigation)
- ✅ TypeScript strict typing
- ✅ Responsive design
- ✅ Design system token usage
- ✅ Component documentation

## Please Provide

**1. Figma Component URL:**

**2. Framework:** (React / Vue / Svelte / Angular / HTML)

**3. Styling:** (CSS Modules / Styled Components / Emotion / Tailwind / MUI / Vanilla CSS)

**4. Component Name (optional):**

**5. Generate Storybook story?** (Yes / No)
