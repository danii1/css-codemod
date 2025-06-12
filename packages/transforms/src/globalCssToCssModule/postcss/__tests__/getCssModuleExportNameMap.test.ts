import { getCssModuleExportNameMap } from '../getCssModuleExportNameMap'

describe('getCssModuleExportNameMap', () => {
  it('returns correct `exportNameMap`', async () => {
    const exportNameMap = await getCssModuleExportNameMap(`
            .repo-header {
                flex: none;

                &:hover {
                    opacity: 1;
                }

                &__button {
                    margin-top: 1px;
                }

                &--alert {
                    border-width: 1px 0;
                }

                .navbar-nav {
                    white-space: nowrap;
                }
            }

            .spacer {
                flex: 1 1 0;
            }
        `)

    expect(exportNameMap).toEqual({
      'repo-header': 'repoHeader',
      'repo-header__button': 'repoHeaderButton',
      'repo-header--alert': 'repoHeaderAlert',
      'navbar-nav': 'navbarNav',
      spacer: 'spacer',
    })
  })

  it('handles underscore-separated class names correctly', async () => {
    const exportNameMap = await getCssModuleExportNameMap(`
            .TrackTooltip_KeyTags_Item {
                display: flex;
            }

            .Component_Section_Title {
                font-size: 18px;
            }

            .Button_Primary_Large {
                padding: 12px;
            }

            .single_underscore {
                color: red;
            }

            .multiple_under_score_parts {
                background: blue;
            }
        `)

    expect(exportNameMap).toEqual({
      'TrackTooltip_KeyTags_Item': 'trackTooltipKeyTagsItem',
      'Component_Section_Title': 'componentSectionTitle',
      'Button_Primary_Large': 'buttonPrimaryLarge',
      'single_underscore': 'singleUnderscore',
      'multiple_under_score_parts': 'multipleUnderScoreParts',
    })
  })
})
