import { useId, useState } from 'react'
import { BookOpen, Cpu, Database, GitBranch, Globe, Server, Smartphone } from 'lucide-react'
import './TechnologyDiagram.css'

const components = [
  {
    id: 'mobile', label: 'Mobile app', technology: 'Expo · React Native', icon: Smartphone,
    detail: 'The place to ask training questions, view your calendar, and record your sessions. Requests go to the API, and responses return to the app.',
  },
  {
    id: 'api', label: 'API backend', technology: 'FastAPI · Cloud Run', icon: Server,
    detail: 'The backend checks account access and routes requests to the right service. It runs on Google Cloud Run, behind Cloud Load Balancing and Cloud Armor.',
  },
  {
    id: 'context', label: 'Athlete context', technology: 'Supabase', icon: Database,
    detail: 'Profiles, training history, and conversations provide context for a response. The workflow loads the information relevant to the question from Supabase.',
  },
  {
    id: 'workflow', label: 'AI workflows', technology: 'LangGraph', icon: GitBranch,
    detail: 'LangGraph coordinates the response. It decides whether a question needs research or web search, gathers relevant training context, and passes the results to the model.',
  },
  {
    id: 'research', label: 'Research library', technology: 'Chroma Cloud', icon: BookOpen,
    detail: 'Relevant passages are retrieved from our indexed research papers. Document identifiers and available citation details stay with the excerpts, so the response can point back to its sources.',
  },
  {
    id: 'web', label: 'Web search', technology: 'Tavily', icon: Globe,
    detail: 'When the question calls for web context, Tavily retrieves relevant results. Their source links travel with the evidence used to prepare the response.',
  },
  {
    id: 'generation', label: 'AI generation', technology: 'OpenAI', icon: Cpu,
    detail: 'The model brings the question, conversation, training context, and retrieved evidence together. The answer streams back to the app with sources when evidence has been used.',
  },
] as const

const connections = [
  { from: 'mobile', to: 'api', path: 'M200 224 H280', mobile: 'M50 96 V116 H24 V136' },
  { from: 'api', to: 'context', path: 'M380 272 V356', mobile: 'M46 184 H54' },
  { from: 'api', to: 'workflow', path: 'M480 224 H560', mobile: 'M24 232 V252 H50 V272' },
  { from: 'context', to: 'workflow', path: 'M480 404 H520 V248 H560', mobile: 'M76 232 V252 H50' },
  { from: 'workflow', to: 'research', path: 'M760 208 H800 V104 H840', mobile: 'M50 368 V388 H24 V408' },
  { from: 'workflow', to: 'web', path: 'M760 240 H800 V336 H840', mobile: 'M50 388 H76 V408' },
  { from: 'workflow', to: 'generation', path: 'M660 272 V356', mobile: 'M50 368 V544' },
]

export default function TechnologyDiagram() {
  const [selected, setSelected] = useState<(typeof components)[number]['id']>('workflow')
  const diagramId = useId()
  const active = components.find(component => component.id === selected)!
  const ActiveIcon = active.icon

  return (
    <figure className="technology-diagram" aria-labelledby={`${diagramId}-title`}>
      <figcaption className="technology-diagram-heading">
        <div>
          <p className="technology-diagram-eyebrow">Arcel system map</p>
          <h3 id={`${diagramId}-title`}>From a question to an informed answer</h3>
        </div>
        <p id={`${diagramId}-instructions`}>Select a component to explore.</p>
      </figcaption>

      <p className="landing-sr-only">The mobile app connects to the API. The API and athlete context
        feed the AI workflow, which can retrieve research and web results before generating an answer.</p>
      <div className="technology-map" role="group" aria-label="Connected components" aria-describedby={`${diagramId}-instructions`}>
        <div className="technology-map-labels" aria-hidden="true"><span>The app</span><span>Your context</span><span>Intelligence</span><span>Evidence</span></div>
        {(['desktop', 'mobile'] as const).map(layout => (
          <svg key={layout} className={`technology-connections technology-connections-${layout}`}
            viewBox={layout === 'desktop' ? '0 0 1040 468' : '0 0 100 640'} preserveAspectRatio="none" aria-hidden="true">
            {connections.map(connection => (
              <path key={`${connection.from}-${connection.to}`} d={layout === 'desktop' ? connection.path : connection.mobile}
                data-active={connection.from === selected || connection.to === selected}
                vectorEffect="non-scaling-stroke" />
            ))}
          </svg>
        ))}
        {components.map(({ id, label, technology, icon: Icon }) => (
          <button key={id} type="button" className={`technology-node technology-node-${id}`}
            aria-pressed={selected === id} aria-controls={`${diagramId}-detail`} onClick={() => setSelected(id)}>
            <Icon size={20} aria-hidden="true" />
            <span className="technology-node-name">{label}</span>
            <span className="technology-node-stack">{technology}</span>
          </button>
        ))}
      </div>

      <div className="technology-detail" id={`${diagramId}-detail`} aria-live="polite" aria-atomic="true">
        <div className="technology-detail-label"><ActiveIcon size={22} aria-hidden="true" /><h4>{active.label}</h4></div>
        <p>{active.detail}</p>
      </div>
      <p className="technology-diagram-note">When a question calls for evidence, Arcel retrieves relevant research and context before generating an answer.</p>
    </figure>
  )
}
