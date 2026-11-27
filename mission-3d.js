'use strict';

function fieldMissionScene(canvas) {
  const gl=canvas.getContext('webgl',{alpha:false,antialias:true});
  if(!gl)throw new Error('В этом браузере недоступна трёхмерная сцена.');
  const vertex=`
    attribute vec3 position;
    attribute vec3 color;
    uniform vec3 eye, rightAxis, upAxis, forwardAxis, translation;
    uniform float aspect;
    varying vec3 tint;
    varying float depth;
    void main(){
      vec3 point=position+translation-eye;
      depth=dot(point,forwardAxis);
      gl_Position=vec4(dot(point,rightAxis)*1.65/aspect,dot(point,upAxis)*1.65,1.001*depth-0.3,depth);
      tint=color;
    }`;
  const fragment=`
    precision mediump float;
    varying vec3 tint;
    varying float depth;
    void main(){
      vec3 sky=vec3(0.72,0.81,0.85);
      gl_FragColor=vec4(mix(tint,sky,smoothstep(46.0,240.0,depth)*0.9),1.0);
    }`;
  const compile=(type,source)=>{
    const shader=gl.createShader(type);
    gl.shaderSource(shader,source);gl.compileShader(shader);
    if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));
    return shader;
  };
  const program=gl.createProgram();
  for(const [type,source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]){
    const shader=compile(type,source);
    gl.attachShader(program,shader);gl.deleteShader(shader);
  }
  gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(.72,.81,.85,1);
  const uniforms=Object.fromEntries(['eye','rightAxis','upAxis','forwardAxis','translation','aspect'].map(name=>[name,gl.getUniformLocation(program,name)]));
  const attributes=['position','color'].map(name=>gl.getAttribLocation(program,name));
  attributes.forEach(attribute=>gl.enableVertexAttribArray(attribute));
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const normalized=v=>{const length=Math.hypot(...v);return v.map(value=>value/length);};
  const hex=code=>[0,2,4].map(i=>Number.parseInt(code.slice(i,i+2),16)/255);
  const triangle=(mesh,a,b,c,shade,factor=1)=>{
    const light=hex(shade).map(value=>value*factor);
    mesh.push(...a,...light,...b,...light,...c,...light);
  };
  const quad=(mesh,a,b,c,d,color,shade=1)=>{
    triangle(mesh,a,b,c,color,shade);
    triangle(mesh,c,d,a,color,shade);
  };
  const box=(mesh,x,y,z,w,h,d,color)=>{
    const a=x-w/2,b=x+w/2,c=y-h/2,e=y+h/2,f=z-d/2,g=z+d/2;
    quad(mesh,[a,e,f],[b,e,f],[b,e,g],[a,e,g],color);
    quad(mesh,[a,c,f],[a,c,g],[a,e,g],[a,e,f],color,.71);
    quad(mesh,[b,c,f],[b,e,f],[b,e,g],[b,c,g],color,.83);
    quad(mesh,[a,c,f],[a,e,f],[b,e,f],[b,c,f],color,.73);
    quad(mesh,[a,c,g],[b,c,g],[b,e,g],[a,e,g],color,.91);
  };
  const wheel=(mesh,x,y,z,r,width,tire,segments=12)=>{
    const left=x-width/2,right=x+width/2;
    for(let i=0;i<segments;i++){
      const a=i*Math.PI*2/segments,b=(i+1)*Math.PI*2/segments;
      const edge=(side,angle)=>[side,y+r*Math.sin(angle),z+r*Math.cos(angle)];
      const shade=.68+.32*Math.max(0,Math.sin((a+b)/2));
      quad(mesh,edge(left,a),edge(right,a),edge(right,b),edge(left,b),tire,shade);
      triangle(mesh,[left,y,z],edge(left,a),edge(left,b),tire,.66);
      triangle(mesh,[right,y,z],edge(right,a),edge(right,b),tire,.83);
    }
  };
  const tree=(mesh,x,z,h)=>{
    box(mesh,x,.45,z,.14,.9,.14,'626258');
    for(let tier=0;tier<3;tier++){
      const bottom=h*(.20+tier*.22),tip=bottom+h*.55,r=h*(.24-tier*.043);
      for(let side=0;side<5;side++){
        const foot=step=>[x+r*Math.cos(step*2*Math.PI/5),bottom,z+r*Math.sin(step*2*Math.PI/5)];
        triangle(mesh,foot(side),foot(side+1),[x,tip,z],tier===2?'56776f':'3d655f',.7+side*.072);
      }
    }
  };
  const truck=[];
  box(truck,0,.64,-.05,2.22,.33,6.4,'28343d');
  box(truck,0,1.72,-1.12,2.42,1.95,4.26,'ecede6');
  box(truck,0,2.72,-1.12,2.46,.11,4.31,'b8c6cb');
  box(truck,0,1.45,2.22,2.34,1.67,1.98,'244766');
  box(truck,0,1.94,3.225,1.92,.53,.032,'789aa8');
  box(truck,0,1.94,3.25,.05,.51,.03,'284c63');
  box(truck,0,.88,3.3,2.44,.20,.19,'a4b5b7');
  box(truck,0,1.23,3.24,1.35,.31,.045,'172a32');
  for(const side of [-1,1]){
    box(truck,side*.96,1.19,3.29,.35,.22,.06,'ffd98e');
    box(truck,side*1.175,1.91,2.30,.032,.56,1.02,'80a1ad');
    box(truck,side*1.38,1.92,2.96,.24,.17,.31,'213b48');
    box(truck,side*1.224,1.23,-1.12,.032,.105,4.14,'ce8415');
    box(truck,side*1.225,1.94,-.83,.034,.61,1.37,'587681');
    box(truck,side*1.25,.77,2.09,.24,.13,1.02,'a3b4b5');
    for(const z of [2.24,-1.15,-2.25]){
      wheel(truck,side*1.07,.53,z,.53,.385,'252e32');
      wheel(truck,side*1.278,.53,z,.228,.055,'718389',9);
    }
  }
  box(truck,0,2.37,2.68,1.06,.13,.22,'e3ad46');
  box(truck,-.65,2.81,-2.31,.74,.16,.54,'587a87');
  const roadX=z=>Math.sin(z/49)*4+Math.sin(z/23)*1.4;
  const ground=(mesh,x1,z1,x2,z2,y,color)=>quad(mesh,[x1,y,z1],[x1,y,z2],[x2,y,z2],[x2,y,z1],color);
  const depot=(mesh,x,z,label)=>{
    box(mesh,x,1.65,z,7,3.3,5.4,'9ca8a8');
    box(mesh,x,3.34,z,7.4,.22,5.8,'435566');
    box(mesh,x,1.21,z+2.71,4.35,2.42,.04,label==='object'?'325579':'627682');
    for(let i=0;i<5;i++)box(mesh,x,0.43+i*.42,z+2.74,4.18,.022,.028,'abbabd');
    box(mesh,x+2.86,2.10,z+2.74,.54,.63,.032,'6c8c98');
  };
  const yard=[];
  ground(yard,-100,-100,100,190,-.06,'bcc6c4');
  ground(yard,-7,-11,9,12,-.02,'65757b');
  ground(yard,-6.8,-10.5,8.8,-10.43,.004,'dac599');
  depot(yard,-7.6,-2.2,'depot');
  box(yard,6.8,.40,-4.2,1.5,.8,1.3,'c79445');
  for(let i=0;i<16;i++)tree(yard,-24+i*3.3,-15-Math.sin(i*2.11)*4,3.8+i%4*.75);
  const route=[];
  ground(route,-95,-24,95,760,-.06,'c3cfca');
  for(let z=-20;z<710;z+=4){
    const x=roadX(z),next=roadX(z+4);
    for(const [offset,width,height,color] of [[0,4.3,-.014,'7e8989'],[0,3.6,-.008,'43545d'],[-3.36,.045,.006,'b3b8af'],[3.36,.045,.006,'b3b8af'],[0,.052,.011,z%12===0?'e6c484':'43545d']]){
      quad(route,[x+offset-width,height,z],[x+offset+width,height,z],[next+offset+width,height,z+4],[next+offset-width,height,z+4],color);
    }
  }
  for(let z=7;z<675;z+=8){
    for(const side of [-1,1]){
      const x=roadX(z)+side*(8+4*Math.sin(z*2.4)**2);
      tree(route,x,z+Math.cos(z)*2,3.4+2.2*Math.sin(z*.53)**2);
      if(z%3===1)box(route,roadX(z)+side*4.6,.42,z,.18,.84,.18,'e3e7e0');
    }
  }
  depot(route,roadX(604)+10,612,'object');
  for(const mesh of [yard,route]){
    for(const z of [-17,51,108]){
      const x=mesh===yard?-16:30;
      for(let i=0;i<5;i++)box(mesh,x,.55,z+i*2,.13,1.1,.13,'70817c');
      box(mesh,x,.7,z+4,.055,.07,8,'688079');
    }
  }
  const buffer=mesh=>{
    const handle=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,handle);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(mesh),gl.STATIC_DRAW);
    return {handle,count:mesh.length/6};
  };
  const model=buffer(truck),depotMesh=buffer(yard),routeMesh=buffer(route);
  const draw=(object,translation=[0,0,0])=>{
    gl.bindBuffer(gl.ARRAY_BUFFER,object.handle);
    gl.vertexAttribPointer(attributes[0],3,gl.FLOAT,false,24,0);
    gl.vertexAttribPointer(attributes[1],3,gl.FLOAT,false,24,12);
    gl.uniform3fv(uniforms.translation,translation);gl.drawArrays(gl.TRIANGLES,0,object.count);
  };
  return ({distance=0,lane=0,phase='yard',angle=.83}={})=>{
    const ratio=Math.min(1.55,window.devicePixelRatio||1);
    const w=Math.round(canvas.clientWidth*ratio),h=Math.round(canvas.clientHeight*ratio);
    if(!w||!h)return;
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    gl.viewport(0,0,w,h);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    const inYard=phase==='yard',arrived=phase==='arrival';
    const x=inYard?0:roadX(distance)+lane*2.85;
    const target=inYard?[0,1.17,0]:arrived?[x,1.2,distance]:[roadX(distance+13)+lane*1.7,1.3,distance+13];
    const eye=inYard?[Math.sin(angle)*9.2,4.5,Math.cos(angle)*9.2]:
      arrived?[x+8,4.7,distance+9]:[x,4.8,distance-10];
    const forward=normalized(target.map((value,i)=>value-eye[i]));
    const right=normalized(cross([0,1,0],forward)),up=cross(forward,right);
    for(const [name,value] of Object.entries({eye,rightAxis:right,upAxis:up,forwardAxis:forward}))gl.uniform3fv(uniforms[name],value);
    gl.uniform1f(uniforms.aspect,w/h);
    draw(inYard?depotMesh:routeMesh);
    draw(model,[x,0,distance]);
  };
}
