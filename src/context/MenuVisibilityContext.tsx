import * as React from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface UnitMenuSettings {
  learningGoals: boolean;
  lxd: boolean;
  gradebook: boolean;
  reportCards: boolean;
}

export interface MenuVisibilityConfig {
  ELEMENTARY: UnitMenuSettings;
  JUNIOR_HIGH: UnitMenuSettings;
  KINDERGARTEN: UnitMenuSettings;
}

const INITIAL_SETTINGS: MenuVisibilityConfig = {
  ELEMENTARY: {
    learningGoals: true,
    lxd: true,
    gradebook: true,
    reportCards: true,
  },
  JUNIOR_HIGH: {
    learningGoals: true,
    lxd: true,
    gradebook: true,
    reportCards: true,
  },
  KINDERGARTEN: {
    learningGoals: true,
    lxd: true,
    gradebook: true,
    reportCards: true,
  }
};

const DEFAULT_ALL_VISIBLE: MenuVisibilityConfig = {
  ELEMENTARY: {
    learningGoals: true,
    lxd: true,
    gradebook: true,
    reportCards: true,
  },
  JUNIOR_HIGH: {
    learningGoals: true,
    lxd: true,
    gradebook: true,
    reportCards: true,
  },
  KINDERGARTEN: {
    learningGoals: true,
    lxd: true,
    gradebook: true,
    reportCards: true,
  }
};

interface MenuVisibilityContextType {
  config: MenuVisibilityConfig;
  isLoading: boolean;
  updateConfig: (newConfig: MenuVisibilityConfig) => Promise<void>;
  isMenuVisible: (unit: string, menuKey: keyof UnitMenuSettings) => boolean;
}

const MenuVisibilityContext = React.createContext<MenuVisibilityContextType | undefined>(undefined);

export function MenuVisibilityProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = React.useState<MenuVisibilityConfig>(INITIAL_SETTINGS);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    const docRef = doc(db, 'systemSettings', 'menuVisibility');
    
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as Partial<MenuVisibilityConfig>;
        
        // Merge with DEFAULT_ALL_VISIBLE to ensure no missing keys cause errors
        const merged: MenuVisibilityConfig = {
          ELEMENTARY: {
            learningGoals: data.ELEMENTARY?.learningGoals ?? INITIAL_SETTINGS.ELEMENTARY.learningGoals,
            lxd: data.ELEMENTARY?.lxd ?? INITIAL_SETTINGS.ELEMENTARY.lxd,
            gradebook: data.ELEMENTARY?.gradebook ?? INITIAL_SETTINGS.ELEMENTARY.gradebook,
            reportCards: data.ELEMENTARY?.reportCards ?? INITIAL_SETTINGS.ELEMENTARY.reportCards,
          },
          JUNIOR_HIGH: {
            learningGoals: data.JUNIOR_HIGH?.learningGoals ?? INITIAL_SETTINGS.JUNIOR_HIGH.learningGoals,
            lxd: data.JUNIOR_HIGH?.lxd ?? INITIAL_SETTINGS.JUNIOR_HIGH.lxd,
            gradebook: data.JUNIOR_HIGH?.gradebook ?? INITIAL_SETTINGS.JUNIOR_HIGH.gradebook,
            reportCards: data.JUNIOR_HIGH?.reportCards ?? INITIAL_SETTINGS.JUNIOR_HIGH.reportCards,
          },
          KINDERGARTEN: {
            learningGoals: data.KINDERGARTEN?.learningGoals ?? INITIAL_SETTINGS.KINDERGARTEN.learningGoals,
            lxd: data.KINDERGARTEN?.lxd ?? INITIAL_SETTINGS.KINDERGARTEN.lxd,
            gradebook: data.KINDERGARTEN?.gradebook ?? INITIAL_SETTINGS.KINDERGARTEN.gradebook,
            reportCards: data.KINDERGARTEN?.reportCards ?? INITIAL_SETTINGS.KINDERGARTEN.reportCards,
          }
        };
        setConfig(merged);
      } else {
        // Document does not exist yet (belum ada) -> Default initial settings
        // Wait, rule 7 says: "Default aman: jika config belum ada/gagal dimuat, semua menu tetap tampil."
        // So let's use DEFAULT_ALL_VISIBLE here!
        setConfig(DEFAULT_ALL_VISIBLE);
      }
      setIsLoading(false);
    }, (error) => {
      console.error("Error loading menu visibility config from Firestore:", error);
      // Fallback to all visible on failure (gagal dimuat)
      setConfig(DEFAULT_ALL_VISIBLE);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const updateConfig = async (newConfig: MenuVisibilityConfig) => {
    const docRef = doc(db, 'systemSettings', 'menuVisibility');
    await setDoc(docRef, newConfig);
  };

  const isMenuVisible = React.useCallback((unit: string, menuKey: keyof UnitMenuSettings): boolean => {
    // Default safe: if loading, all menus are visible
    if (isLoading) return true;
    
    const normalizedUnit = unit.toUpperCase();
    if (normalizedUnit === 'ELEMENTARY') {
      return config.ELEMENTARY[menuKey] ?? true;
    }
    if (normalizedUnit === 'JUNIOR_HIGH') {
      return config.JUNIOR_HIGH[menuKey] ?? true;
    }
    if (normalizedUnit === 'KINDERGARTEN') {
      return config.KINDERGARTEN[menuKey] ?? true;
    }
    return true;
  }, [config, isLoading]);

  return (
    <MenuVisibilityContext.Provider value={{ config, isLoading, updateConfig, isMenuVisible }}>
      {children}
    </MenuVisibilityContext.Provider>
  );
}

export function useMenuVisibility() {
  const context = React.useContext(MenuVisibilityContext);
  if (context === undefined) {
    throw new Error('useMenuVisibility must be used within a MenuVisibilityProvider');
  }
  return context;
}
