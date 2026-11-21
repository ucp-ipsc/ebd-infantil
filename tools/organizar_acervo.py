"""Reproduz a seleção inicial a partir do índice de leitura local (fora do site).

Uso: python tools/organizar_acervo.py ../tmp/pdf-index.json
Execute a partir de ebd-infantil. Os originais nunca são movidos ou alterados.
"""
import hashlib
import json
from pathlib import Path
import re
import shutil
import sys
import unicodedata

# Índice do PDF lido, aulas relacionadas, título editorial, relação, passagem de origem.
SELECTION = [
 (14,[8],'José: Deus tem planos para mim','same-story','Gênesis 37; 39–47'),
 (20,[8],'José: conversa em família','same-story','Gênesis 37; 39–47'),
 (31,[22],'Tabita ajuda: servir e compartilhar','theme','Atos 9:36–42; apoio ao cuidado mútuo'),
 (34,[22],'Tabita: dica aos pais','theme','Atos 9:36–42; apoio ao cuidado mútuo'),
 (33,[25,40],'Filipe: a Palavra para todos','theme','Mateus 5:14–16; Atos 8:26–35'),
 (36,[35],'Continue olhando para Jesus','theme','Hebreus 12:1–3'),
 (37,[12,13],'A esperança está viva','same-story','Crucificação e ressurreição · João 18–20:1–18'),
 (42,[13],'Páscoa: Jesus está vivo','same-story','Mateus 26–28'),
 (43,[13],'Páscoa: atividades em pequeno grupo','same-story','Mateus 26–28'),
 (44,[14],'Jesus e os discípulos na praia','theme','João 21:1–14; outro encontro após a ressurreição'),
 (52,[9],'Moisés e a sarça ardente','same-story','Êxodo 3:1–18; 6:11'),
 (53,[33],'Ezequias ora a Deus: conversa em família','theme','Isaías 37:14–20, 35; 38:1–6, 20'),
 (55,[37],'A Festa das Cabanas','theme','Deuteronômio 16:13–17; celebração da presença de Deus'),
 (57,[37],'A reconstrução do templo','theme','Esdras 3:10–13; outro episódio sobre a casa de Deus'),
 (61,[35],'Confiando em tempos difíceis','theme','Habacuque 3:17–18'),
 (66,[1],'A criação revela a glória de Deus','theme','Salmos 8 e 19'),
 (74,[4],'A arca de Noé: roteiro','same-story','Gênesis 6:8–9:17'),
 (76,[4],'A arca de Noé: maternal','same-story','Gênesis 6:8–9:17'),
 (84,[26],'Paulo e Silas: atividades','same-story','Atos 16:16–40'),
 (88,[35],'Pedro anda sobre as águas','theme','Mateus 14:22–33; confiança em Jesus'),
 (92,[2],'Criados à imagem de Deus','theme','Salmo 139:1–14; apoio: Gênesis 1:26–28'),
 (101,[16],'Filipe e Natanael: falar de Jesus','theme','João 1:43–49; apoio à evangelização'),
 (121,[50,51,52],'Natal: visão geral das histórias','theme','João 1; Lucas 1–2; Mateus 1'),
 (122,[51],'Nasceu para salvar: roteiro','same-story','Lucas 2:1–7'),
 (128,[51],'Presépio: imagens para a história','same-story','Material visual do Natal'),
 (129,[50,51],'Celebrando o nascimento de Jesus','same-story','Lucas 1:26–33, 38; 2:1–20'),
 (130,[51],'Pastores e anjos: conversa em família','same-story','Lucas 2:8–20'),
 (133,[2],'Adão e Eva: roteiro','same-story','Gênesis 1:27–28; 2:15, 19–20'),
 (134,[2],'Adão e Eva: atividades','same-story','Gênesis 1:27–28; 2:15, 19–20'),
 (135,[9],'O bebê Moisés','theme','Êxodo 2:1–10; contexto anterior ao chamado de Moisés'),
 (139,[38],'Samuel unge Davi','theme','1 Samuel 16:1–13; contexto anterior ao reinado'),
 (140,[31,34,35],'Davi e os Salmos: sabedoria','theme','Salmo 1:1–4; apoio: Salmos 23, 8 e 18'),
 (163,[4],'Noé: conversa em família','same-story','Gênesis 6–9'),
 (164,[1,2],'Cartões de versículo: a criação','same-story','Gênesis 1:31'),
 (166,[1],'Deus fez todas as coisas: maternal','same-story','Gênesis 1'),
 (167,[1,2],'Animais, pessoas e o descanso de Deus','same-story','Gênesis 1:24–2:3'),
 (168,[1,2],'Passeio espacial da criação: imprimíveis','same-story','Atividades da criação · março/2026, semana 5'),
 (169,[1,2],'A criação: atividades em pequeno grupo','same-story','Gênesis 1:24–2:3'),
 (171,[1],'Deus fez os animais: conversa em família','same-story','Gênesis 1:20–23'),
 (174,[13],'Jesus morreu e ressuscitou: imprimíveis','same-story','Atividades de Páscoa · abril/2026, semana 1'),
 (176,[20,29],'Pentecostes e o fruto do Espírito','same-story','Atos 2:1–41; apoio: Gálatas 5:22–23'),
 (177,[13,14,16,17,20],'Páscoa, missão e Pentecostes: guia para famílias','theme','João 18–20; Lucas 24; Mateus 28; Atos 1–2'),
 (178,[16,17,45],'A grande comissão e a ascensão: devocional','theme','Mateus 28; Atos 1; inclui a promessa da volta de Jesus'),
 (198,[19],'Rute, Noemi e Boaz: família','theme','Rute 1–2; apoio ao tema da família'),
 (200,[43],'Davi louva a Deus','theme','2 Samuel 6:12–15; Salmo 144:9–10'),
 (202,[19,22],'Encorajem uns aos outros','theme','Hebreus 10:24–25'),
 (208,[30],'Jesus nos ensina a amar','theme','Mateus 8; Marcos 5 e 10; Filipenses 2:5'),
 (215,[30],'Levem os fardos uns dos outros','theme','Gálatas 6:2; Lucas 10:25–37'),
 (222,[30],'O bom samaritano: imprimíveis','theme','Lucas 10:25–37; atividade de apoio ao amor ao próximo'),
 (226,[30],'O bom samaritano: conversa em família','theme','Lucas 10:25–37; Gálatas 6:2'),
 (239,[12],'Entrada triunfal: atividades','same-story','Mateus 21:1–11; João 12:12–15'),
 (253,[25,40],'Filipe: ouvindo a Palavra de Deus','theme','Atos 8:26–35; outro episódio de anúncio a outros povos'),
 (255,[26,33],'Paulo e Silas: oração','theme','Atos 16:16–40'),
 (270,[31],'Maria e Marta: ouvir Jesus','theme','Lucas 10:38–42; apoio à escuta da Palavra'),
 (274,[35],'Paulo no naufrágio: perseverança','theme','Atos 27–28:10; episódio posterior às viagens de Atos 13–16'),
 (275,[24],'A conversão de Saulo: conversa em família','same-story','Atos 9:1–31'),
 (276,[47,48,52],'Deus habitará com seu povo','same-story','Apocalipse 21:3–5'),
]

def slug(value):
    value=unicodedata.normalize('NFKD',value).encode('ascii','ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+','-',value).strip('-')[:80]

def main():
    project=Path(__file__).resolve().parents[1]
    workspace=project.parent
    records=json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
    plan=json.loads((project/'dados/planejamento.js').read_text(encoding='utf-8').split('=',1)[1].strip().removesuffix(';'))
    result=[]
    for index,nums,title,match,context in SELECTION:
        source=workspace/records[index]['path']
        lesson=next(l for l in plan['lessons'] if l['id']==f'aula-{nums[0]:02}')
        topic=next(t for t in plan['topics'] if t['id']==lesson['topic'])
        folder=project/'atividades'/f"{topic['id']:02}-{slug(topic['title'])}"/slug(lesson['title'])
        folder.mkdir(parents=True,exist_ok=True)
        name=f'{index:03}-{slug(source.stem)}.pdf'
        target=folder/name
        if source.stat().st_size>=100*1024*1024:
            raise ValueError(f'Arquivo maior que o limite de arquivo Git: {source.name}')
        shutil.copy2(source,target)
        p=str(source).lower()
        age='6 a 11 anos' if '252' in p else '2 anos' if '2anos' in p or '2 anos' in p else 'Maternal' if 'maternal' in p else '3 a 5 anos'
        kind='Conversa em família' if 'dp_' in p else 'Devocional' if '_td_' in p else 'Atividades para imprimir' if '_pa_' in p else 'Atividades em grupo' if '_pg_' in p else 'Roteiro e recursos'
        result.append({'id':f'recurso-{index:03}','title':title,'path':target.relative_to(project).as_posix(),'format':'PDF','age':age,'kind':kind,'sourceYear':source.relative_to(workspace).parts[1],'source':source.relative_to(workspace).as_posix(),'lessons':[f'aula-{n:02}' for n in nums],'match':match,'context':context,'bytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest()})
        print(f'Copiado {len(result)}/{len(SELECTION)}: {title}',flush=True)
    (project/'dados/materiais.js').write_text('window.EBD_MATERIALS = '+json.dumps(result,ensure_ascii=False,indent=2)+';\n',encoding='utf-8')
    # Metadados dos PDFs não selecionados permitem continuar a curadoria sem copiar todo o acervo.
    chosen={row[0] for row in SELECTION}
    pending=[{'source':r['path'].replace('\\','/'),'status':'Ainda não associado ao calendário de 2027'} for i,r in enumerate(records) if i not in chosen]
    (project/'tools/acervo-a-revisar.json').write_text(json.dumps(pending,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'resources':len(result),'bytes':sum(r['bytes'] for r in result),'lessonsWithResources':len(set(l for r in result for l in r['lessons']))}))

if __name__=='__main__': main()
