import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MantineProvider } from '@mantine/core'
import '@mantine/core/styles.css'
import './styles.css'
import { MobileUiPrototype } from './prototype-mobile-ui/MobileUiPrototype.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider defaultColorScheme="dark">
      <MobileUiPrototype />
    </MantineProvider>
  </StrictMode>,
)
