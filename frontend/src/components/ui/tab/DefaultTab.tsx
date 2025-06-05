import React, { useState } from 'react';

interface TabItem {
  name: string;
  content: React.ReactNode;
}

interface DefaultTabProps {
  className?: string;
  defaultTab?: string;
  tabs: TabItem[];
}

const DefaultTab: React.FC<DefaultTabProps> = ({ className = '', defaultTab, tabs }) => {
  const [activeTab, setActiveTab] = useState(defaultTab || tabs[0]?.name || '');

  if (!tabs.length) {
    return <div>No tabs provided</div>;
  }

  return (
    <div className={`rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] ${className}`}>
      <div className="p-4 border-t border-gray-100 dark:border-gray-800 sm:p-6">
        <div className="space-y-6">
          <div>
            <div className="p-3 border border-gray-200 rounded-t-xl dark:border-gray-800">
              <nav className="flex overflow-x-auto rounded-lg bg-gray-100 p-1 dark:bg-gray-900 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-white dark:[&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-200 dark:[&::-webkit-scrollbar-thumb]:bg-gray-600">
                {tabs.map((tab) => (
                  <button
                    key={tab.name}
                    onClick={() => setActiveTab(tab.name)}
                    className={`inline-flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors duration-200 ease-in-out ${activeTab === tab.name
                        ? 'bg-white text-gray-900 shadow-theme-xs dark:bg-white/[0.03] dark:text-white'
                        : 'bg-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                      }`}
                  >
                    {tab.name}
                  </button>
                ))}
              </nav>
            </div>
            <div className="p-6 pt-4 border border-t-0 border-gray-200 rounded-b-xl dark:border-gray-800">
              {tabs.find((tab) => tab.name === activeTab)?.content || <p>No content available</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DefaultTab;