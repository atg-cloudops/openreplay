import Period, { CUSTOM_RANGE } from 'Types/app/period';
import { FilterCategory, FilterKey } from 'Types/filter/filterType';
import {
  conditionalFiltersMap,
  filtersMap,
  generateFilterOptions,
  liveFiltersMap,
  mobileConditionalFiltersMap
} from 'Types/filter/newFilter';
import { List } from 'immutable';
import { makeAutoObservable, action, observable } from 'mobx';
import { searchService } from 'App/services';
import Search from 'App/mstore/types/search';
import Filter, { checkFilterValue, IFilter } from 'App/mstore/types/filter';
import FilterItem from 'App/mstore/types/filterItem';
import { sessionStore } from 'App/mstore';
import SavedSearch, { ISavedSearch } from 'App/mstore/types/savedSearch';
import { iTag } from '@/services/NotesService';
import { issues_types } from 'Types/session/issue';

const PER_PAGE = 10;

export const checkValues = (key: any, value: any) => {
  if (key === FilterKey.DURATION) {
    return value[0] === '' || value[0] === null ? [0, value[1]] : value;
  }
  return value.filter((i: any) => i !== '' && i !== null);
};

export const filterMap = ({
                            category,
                            value,
                            key,
                            operator,
                            sourceOperator,
                            source,
                            custom,
                            isEvent,
                            filters,
                            sort,
                            order
                          }: any) => ({
  value: checkValues(key, value),
  custom,
  type: category === FilterCategory.METADATA ? FilterKey.METADATA : key,
  operator,
  source: category === FilterCategory.METADATA ? key.replace(/^_/, '') : source,
  sourceOperator,
  isEvent,
  filters: filters ? filters.map(filterMap) : []
});

export const TAB_MAP: any = {
  all: { name: 'All', type: 'all' },
  sessions: { name: 'Sessions', type: 'sessions' },
  bookmarks: { name: 'Bookmarks', type: 'bookmarks' },
  notes: { name: 'Notes', type: 'notes' },
  recommendations: { name: 'Recommendations', type: 'recommendations' }
};

class SearchStore {
  filterList = generateFilterOptions(filtersMap);
  filterListLive = generateFilterOptions(liveFiltersMap);
  filterListConditional = generateFilterOptions(conditionalFiltersMap);
  filterListMobileConditional = generateFilterOptions(mobileConditionalFiltersMap);
  list = List();
  latestRequestTime: number | null = null;
  latestList = List();
  alertMetricId: number | null = null;
  instance = new Search();
  savedSearch: ISavedSearch = new SavedSearch();
  filterSearchList: any = {};
  currentPage = 1;
  pageSize = PER_PAGE;
  activeTab = { name: 'All', type: 'all' };
  scrollY = 0;
  sessions = List();
  total: number = 0;
  loadingFilterSearch = false;
  isSaving: boolean = false;
  activeTags: any[] = [];

  constructor() {
    makeAutoObservable(this);
  }

  applySavedSearch(savedSearch: ISavedSearch) {
    this.savedSearch = savedSearch;
    // this.instance = new Search({
    //   filters: savedSearch.filter.filters
    // });
    console.log('savedSearch.filter.filters', savedSearch.filter.filters);
    this.edit({ filters: savedSearch.filter ? savedSearch.filter.filters.map((i: FilterItem) => new FilterItem().fromJson(i)) : [] });
    // this.edit({ filters: savedSearch.filter ? savedSearch.filter.filters : [] });
    this.currentPage = 1;
  }

  async fetchSavedSearchList() {
    const response = await searchService.fetchSavedSearch();
    this.list = List(response.map((item: any) => new SavedSearch(item)));
  }

  edit(instance: Partial<Search>) {
    this.instance = new Search(Object.assign({ ...this.instance }, instance));
    this.currentPage = 1;
  }

  editSavedSearch(instance: Partial<SavedSearch>) {
    this.savedSearch = new SavedSearch(Object.assign(this.savedSearch.toData(), instance));
  }

  apply(filter: any, fromUrl: boolean) {
    if (fromUrl) {
      this.instance = new Search(filter);
      this.currentPage = 1;
    } else {
      this.instance = { ...this.instance, ...filter };
    }
  }

  applyFilter(filter: any, force = false) {
    this.apply(filter, false);
  }

  fetchFilterSearch(params: any) {
    this.loadingFilterSearch = true;
    searchService.fetchFilterSearch(params).then((response: any) => {
      this.filterSearchList = response.reduce((acc: any, item: any) => {
        const { projectId, type, value } = item;
        const key = type;
        if (!acc[key]) acc[key] = [];
        acc[key].push({ projectId, value });
        return acc;
      }, {}).finally(() => {
        this.loadingFilterSearch = false;
      });
    });
  }

  updateCurrentPage(page: number) {
    this.currentPage = page;
    void this.fetchSessions();
  }

  setActiveTab(tab: string) {
    this.activeTab = TAB_MAP[tab];
    // this.activeTab = tab;
    this.currentPage = 1;
    // this.fetchSessions();
  }

  toggleTag(tag?: iTag) {
    if (!tag) {
      this.activeTags = [];
      void this.fetchSessions(true);
    } else {
      this.activeTags = [tag];
      void this.fetchSessions(true);
    }
  }

  async removeSavedSearch(id: string): Promise<void> {
    await searchService.deleteSavedSearch(id);
    this.savedSearch = new SavedSearch({});
    await this.fetchSavedSearchList();
  }

  async save(id?: string | null, rename = false): Promise<void> {
    const filter = this.instance.toData();
    const isNew = !id;
    const instance = this.savedSearch.toData();
    const newInstance = rename ? instance : { ...instance, filter };
    newInstance.filter.filters = newInstance.filter.filters.map(filterMap);

    await searchService.saveSavedSearch(newInstance, id);
    await this.fetchSavedSearchList();

    if (isNew) {
      const lastSavedSearch = this.list.last();
      this.applySavedSearch(lastSavedSearch);
    }
  }

  clearList() {
    this.list = List();
  }

  clearSearch() {
    const instance = this.instance;
    this.edit(new Search({
      rangeValue: instance.rangeValue,
      startDate: instance.startDate,
      endDate: instance.endDate,
      filters: []
    }));

    this.savedSearch = new SavedSearch({});
    sessionStore.clearList();
    void this.fetchSessions(true);
  }

  checkForLatestSessions() {
    const filter = this.instance.toSearch();
    if (this.latestRequestTime) {
      const period = Period({ rangeName: CUSTOM_RANGE, start: this.latestRequestTime, end: Date.now() });
      const newTimestamps: any = period.toJSON();
      filter.startTimestamp = newTimestamps.startDate;
      filter.endTimestamp = newTimestamps.endDate;
    }
    searchService.checkLatestSessions(filter).then((response: any) => {
      this.latestList = response;
      this.latestRequestTime = Date.now();
    });
  }

  addFilter(filter: any) {
    const index = filter.isEvent ? -1 : this.instance.filters.findIndex((i: FilterItem) => i.key === filter.key);

    filter.value = checkFilterValue(filter.value);
    filter.filters = filter.filters
      ? filter.filters.map((subFilter: any) => ({
        ...subFilter,
        value: checkFilterValue(subFilter.value)
      }))
      : null;

    if (index > -1) {
      const oldFilter = new FilterItem(this.instance.filters[index]);
      const updatedFilter = {
        ...oldFilter,
        value: oldFilter.value.concat(filter.value)
      };
      oldFilter.merge(updatedFilter);
      this.updateFilter(index, updatedFilter);
    } else {
      this.instance.filters.push(filter);
      this.instance = new Search({
        ...this.instance.toData()
      });
    }

    if (filter.value && filter.value[0] && filter.value[0] !== '') {
      this.fetchSessions();
    }
  }

  addFilterByKeyAndValue(key: any, value: any, operator?: string, sourceOperator?: string, source?: string) {
    let defaultFilter = { ...filtersMap[key] };
    defaultFilter.value = value;

    if (operator) {
      defaultFilter.operator = operator;
    }
    if (defaultFilter.hasSource && source && sourceOperator) {
      defaultFilter.sourceOperator = sourceOperator;
      defaultFilter.source = source;
    }

    this.addFilter(defaultFilter);
  }

  refreshFilterOptions() {
    // TODO
  }

  updateFilter = (index: number, search: Partial<FilterItem>) => {
    const newFilters = this.instance.filters.map((_filter: any, i: any) => {
      if (i === index) {
        return search;
      } else {
        return _filter;
      }
    });

    this.instance = new Search({
      ...this.instance.toData(),
      filters: newFilters
    });
  };

  removeFilter = (index: number) => {
    const newFilters = this.instance.filters.filter((_filter: any, i: any) => {
      return i !== index;
    });

    this.instance = new Search({
      ...this.instance.toData(),
      filters: newFilters
    });
  };

  setScrollPosition = (y: number) => {
    this.scrollY = y;
  };

  async fetchAutoplaySessions(page: number): Promise<void> {
    // TODO
  }

  async fetchSessions(force: boolean = false, bookmarked: boolean = false): Promise<void> {
    const filter = this.instance.toSearch();

    if (this.activeTags[0] && this.activeTags[0] !== 'all') {
      const tagFilter = filtersMap[FilterKey.ISSUE];
      tagFilter.value = [issues_types.find((i: any) => i.type === this.activeTags[0])?.type];
      delete tagFilter.operatorOptions;
      delete tagFilter.options;
      delete tagFilter.placeholder;
      delete tagFilter.label;
      delete tagFilter.icon;
      filter.filters = filter.filters.concat(tagFilter);
    }

    await sessionStore.fetchSessions({
      ...filter,
      page: this.currentPage,
      perPage: this.pageSize,
      tab: this.activeTab.type,
      bookmarked: bookmarked ? true : undefined
    }, force);
  };
}

export default SearchStore;
