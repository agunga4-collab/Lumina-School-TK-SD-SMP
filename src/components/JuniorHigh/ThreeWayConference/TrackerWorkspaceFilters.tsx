import React from 'react';
import { Search, X, SlidersHorizontal } from 'lucide-react';

interface TrackerWorkspaceFiltersProps {
  search: string;
  setSearch: (s: string) => void;
  gradeFilter: string;
  setGradeFilter: (g: string) => void;
  classFilter: string;
  setClassFilter: (c: string) => void;
  goalTypeFilter: string;
  setGoalTypeFilter: (g: string) => void;
  mentorFilter: string;
  setMentorFilter: (m: string) => void;
  commentFilter: string;
  setCommentFilter: (c: string) => void;
  statusFilter: string;
  setStatusFilter: (s: string) => void;
  sortBy: string;
  setSortBy: (s: string) => void;
  availableGrades: Array<string | number>;
  availableClasses: string[];
  availableMentors: Array<{ id: string; name: string }>;
  onClear: () => void;
  resultsCount: number;
}

export const TrackerWorkspaceFilters: React.FC<TrackerWorkspaceFiltersProps> = ({
  search,
  setSearch,
  gradeFilter,
  setGradeFilter,
  classFilter,
  setClassFilter,
  goalTypeFilter,
  setGoalTypeFilter,
  mentorFilter,
  setMentorFilter,
  commentFilter,
  setCommentFilter,
  statusFilter,
  setStatusFilter,
  sortBy,
  setSortBy,
  availableGrades,
  availableClasses,
  availableMentors,
  onClear,
  resultsCount,
}) => {
  const hasActiveFilters =
    search !== '' ||
    gradeFilter !== 'all' ||
    classFilter !== 'all' ||
    goalTypeFilter !== 'all' ||
    mentorFilter !== 'all' ||
    commentFilter !== 'all' ||
    statusFilter !== 'all' ||
    sortBy !== 'date_desc';

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm space-y-4" id="tracker-filters-container">
      {/* Search and Sort row */}
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Search Input */}
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-gray-400" />
          </div>
          <input
            id="tracker-filter-search-input"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search student by name or NIS..."
            className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg text-sm placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-gray-50/50"
          />
          {search && (
            <button
              id="tracker-clear-search-btn"
              onClick={() => setSearch('')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Sort Select */}
        <div className="w-full lg:w-64 flex items-center gap-2">
          <label htmlFor="tracker-filter-sort-select" className="text-xs font-semibold text-gray-500 whitespace-nowrap uppercase tracking-wider">
            Sort By:
          </label>
          <select
            id="tracker-filter-sort-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="block w-full py-2 px-3 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="date_desc">Entry Date (Newest)</option>
            <option value="date_asc">Entry Date (Oldest)</option>
            <option value="student_asc">Student Name (A-Z)</option>
            <option value="class_asc">Class (A-Z)</option>
            <option value="goal_type_asc">Goal Type</option>
            <option value="mentor_asc">Mentor Name (A-Z)</option>
          </select>
        </div>
      </div>

      {/* Filter Options Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-4 pt-2 border-t border-gray-50">
        {/* Grade Filter */}
        <div>
          <label htmlFor="tracker-filter-grade-select" className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
            Grade
          </label>
          <select
            id="tracker-filter-grade-select"
            value={gradeFilter}
            onChange={(e) => setGradeFilter(e.target.value)}
            className="block w-full py-2 px-3 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">Pilih Grade</option>
            {availableGrades.map((g) => (
              <option key={g} value={g}>
                Grade {g}
              </option>
            ))}
          </select>
        </div>

        {/* Class Filter */}
        <div>
          <label htmlFor="tracker-filter-class-select" className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
            Class
          </label>
          <select
            id="tracker-filter-class-select"
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="block w-full py-2 px-3 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">All Classes</option>
            {availableClasses.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {/* Goal Type Filter */}
        <div>
          <label htmlFor="tracker-filter-goal-type-select" className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
            Goal Type
          </label>
          <select
            id="tracker-filter-goal-type-select"
            value={goalTypeFilter}
            onChange={(e) => setGoalTypeFilter(e.target.value)}
            className="block w-full py-2 px-3 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">All Goal Types</option>
            <option value="Spiritual">Spiritual</option>
            <option value="Imaginal">Imaginal</option>
            <option value="Rational">Rational</option>
            <option value="Material/Physical">Material/Physical</option>
          </select>
        </div>

        {/* Mentor Filter */}
        <div>
          <label htmlFor="tracker-filter-mentor-select" className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
            Mentor
          </label>
          <select
            id="tracker-filter-mentor-select"
            value={mentorFilter}
            onChange={(e) => setMentorFilter(e.target.value)}
            className="block w-full py-2 px-3 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">All Mentors</option>
            <option value="unassigned">Unassigned</option>
            {availableMentors.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        {/* Comment Status Filter */}
        <div>
          <label htmlFor="tracker-filter-comment-select" className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
            Comment Status
          </label>
          <select
            id="tracker-filter-comment-select"
            value={commentFilter}
            onChange={(e) => setCommentFilter(e.target.value)}
            className="block w-full py-2 px-3 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">All Entries</option>
            <option value="commented">Commented</option>
            <option value="uncommented">No Comment</option>
          </select>
        </div>

        {/* Workflow Status Filter */}
        <div>
          <label htmlFor="tracker-filter-status-select" className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
            Workflow Status
          </label>
          <select
            id="tracker-filter-status-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="block w-full py-2 px-3 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">All Statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="EDITING">Editing</option>
            <option value="SUBMITTED">Submitted / Waiting Review</option>
            <option value="PARTIALLY_APPROVED">Partially Approved</option>
            <option value="REVISION_REQUIRED">Revision Required</option>
            <option value="FULLY_APPROVED">Fully Approved</option>
          </select>
        </div>
      </div>

      {/* Results footer and clear filters button */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-50 text-xs">
        <div className="flex items-center gap-1.5 text-gray-500 font-medium">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span>Found <strong className="text-gray-900">{resultsCount}</strong> progress updates</span>
        </div>
        {hasActiveFilters && (
          <button
            id="tracker-clear-filters-btn"
            onClick={onClear}
            className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer transition"
          >
            Clear Filters
          </button>
        )}
      </div>
    </div>
  );
};
